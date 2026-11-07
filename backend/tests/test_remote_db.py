"""Exercise the remote adapter using the actual libSQL driver, without network."""
import sqlite3
import concurrent.futures
import threading
import time

import libsql
import pytest

from app.db import Database
from app.remote_db import Connection, Row, validate_remote_config


@pytest.fixture
def remote_db(tmp_path, monkeypatch):
    database_path = tmp_path / 'shared-libsql.db'
    local_connect = libsql.connect
    invocations = []

    def direct_remote_contract(**kwargs):
        invocations.append(kwargs)
        assert kwargs == {'database': 'libsql://fixture.turso.io', 'auth_token': 'fixture-token',
                          'timeout': 15, 'isolation_level': None}
        return local_connect(str(database_path), isolation_level=None)

    monkeypatch.setattr(libsql, 'connect', direct_remote_contract)
    ignored_path = tmp_path / 'must-not-be-created' / 'local.db'
    database = Database(ignored_path, remote_url='libsql://fixture.turso.io', auth_token='fixture-token')
    assert not ignored_path.parent.exists()
    assert invocations
    return database


def test_remote_transactions_persist_and_rollback(remote_db):
    remote_db.set_setting('committed', {'number': 1})
    with pytest.raises(RuntimeError, match='abort transaction'):
        with remote_db.transaction() as connection:
            remote_db.set_setting('committed', {'number': 2}, connection)
            remote_db.set_setting('rolled-back', True, connection)
            raise RuntimeError('abort transaction')
    assert remote_db.get_setting('committed') == {'number': 1}
    assert remote_db.get_setting('rolled-back') is None
    assert remote_db.next_id('example') == 'example_1'
    assert remote_db.next_id('example') == 'example_2'


def test_single_getter_uses_one_select_without_write_transaction(remote_db, monkeypatch):
    from app import remote_db as adapter
    remote_db.set_setting('existing', 42)
    original = adapter.connect_remote
    operations = []

    class TrackedConnection:
        def __init__(self, connection):
            self.connection = connection

        def execute(self, sql, parameters=()):
            operations.append(sql)
            return self.connection.execute(sql, parameters)

        def commit(self):
            operations.append('COMMIT')
            self.connection.commit()

        def rollback(self):
            operations.append('ROLLBACK')
            self.connection.rollback()

        def close(self):
            self.connection.close()

    monkeypatch.setattr(adapter, 'connect_remote', lambda *args: TrackedConnection(original(*args)))
    assert remote_db.get_setting('existing') == 42
    assert operations == ['SELECT value_json FROM settings WHERE key=?']
    operations.clear()
    remote_db.set_setting('existing', 43)
    assert operations[0:2] == ['PRAGMA foreign_keys=ON', 'BEGIN IMMEDIATE']
    assert operations[-1] == 'COMMIT'


def test_shared_read_context_batches_caches_and_keeps_one_snapshot(remote_db, tmp_path, monkeypatch):
    from app import remote_db as adapter
    for index in range(65):
        remote_db.set_cache('summary', f'c{index}', {'text': f'summary {index}'}, {'calls': 1})
    remote_db.set_cache('translation', 'other', {'text': 'not a summary'})
    remote_db.set_setting('snapshot', 'before')
    # An independent writer simulates another service process on the same
    # primary. WAL allows its commit while the existing read snapshot is open.
    writer = sqlite3.connect(tmp_path / 'shared-libsql.db')
    writer.execute('PRAGMA journal_mode=WAL')
    original = adapter.connect_remote
    operations = []

    class TrackedConnection:
        def __init__(self, connection):
            self.connection = connection

        def execute(self, sql, parameters=()):
            operations.append(sql)
            return self.connection.execute(sql, parameters)

        def commit(self):
            operations.append('COMMIT')
            self.connection.commit()

        def rollback(self):
            self.connection.rollback()

        def close(self):
            self.connection.close()

    monkeypatch.setattr(adapter, 'connect_remote', lambda *args: TrackedConnection(original(*args)))
    try:
        with remote_db.read_connection() as connection:
            assert remote_db.get_setting('snapshot', conn=connection) == 'before'
            writer.execute('UPDATE settings SET value_json=? WHERE key=?', ('"after"', 'snapshot'))
            writer.commit()
            caches = remote_db.get_caches('summary', connection)
            assert len(caches) == 65 and 'other' not in caches
            assert caches['c0']['body'] == {'text': 'summary 0'}
            assert caches['c0']['usage'] == {'calls': 1}
            assert caches['c0']['createdAt']
            assert remote_db.get_setting('snapshot', conn=connection) == 'before'
        assert operations[0] == 'BEGIN' and operations[-1] == 'COMMIT'
        assert len(operations) == 5  # BEGIN + 3 SELECTs + COMMIT, including all 65 caches.
        assert sum('FROM ai_cache' in sql for sql in operations) == 1
        assert not any('PRAGMA' in sql or 'IMMEDIATE' in sql for sql in operations)
        assert remote_db.get_setting('snapshot') == 'after'
    finally:
        writer.close()


@pytest.mark.parametrize('sql', ['DELETE FROM settings', 'INSERT INTO settings VALUES (1,2)',
                               'UPDATE settings SET value_json=1', 'PRAGMA journal_mode=WAL',
                               'WITH x AS (SELECT 1) DELETE FROM settings',
                               'SELECT 1; DELETE FROM settings', 'COMMIT', 'BEGIN IMMEDIATE'])
def test_read_context_rejects_non_read_statement(remote_db, sql):
    with remote_db.read_connection() as connection:
        with pytest.raises(sqlite3.OperationalError, match='read-only'):
            connection.execute(sql)
        with pytest.raises(sqlite3.OperationalError, match='read-only'):
            remote_db.set_setting('should-not-exist', 1, connection)
        with pytest.raises(sqlite3.OperationalError, match='read-only'):
            connection.executescript('SELECT 1')
        cursor = connection.execute("SELECT ';' AS punctuation")
        assert cursor.fetchone()['punctuation'] == ';'
        assert not hasattr(cursor, 'execute')
    assert remote_db.get_setting('should-not-exist') is None


def test_remote_threads_serialize_transactions_before_native_begin(remote_db):
    other = Database(remote_db.path, remote_url=remote_db.remote_url, auth_token='fixture-token')
    barrier = threading.Barrier(2)
    active, maximum = 0, 0

    def write(database):
        nonlocal active, maximum
        barrier.wait(timeout=5)
        with database.transaction() as connection:
            active += 1
            maximum = max(maximum, active)
            time.sleep(.02)  # Let the other thread reach its transaction guard.
            value = database.next_id('thread', connection)
            active -= 1
            return value

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(write, [remote_db, other]))
    assert maximum == 1
    assert set(results) == {'thread_1', 'thread_2'}


@pytest.mark.parametrize('failure', ['begin', 'body', 'commit'])
def test_remote_cleanup_preserves_original_failure(remote_db, monkeypatch, failure):
    from app import remote_db as adapter

    class BrokenConnection:
        def execute(self, sql):
            if failure == 'begin' and sql == 'BEGIN IMMEDIATE':
                raise ValueError('original-begin')

        def commit(self):
            if failure == 'commit':
                raise ValueError('original-commit')

        def rollback(self):
            raise ValueError('already rolled back')

        def close(self):
            raise ValueError('cleanup close failed')

    monkeypatch.setattr(adapter, 'connect_remote', lambda *args: BrokenConnection())
    with pytest.raises(ValueError, match='original-' + failure):
        with remote_db.transaction():
            if failure == 'body':
                raise ValueError('original-body')


def test_remote_schema_marker_skips_repeat_migration(remote_db, monkeypatch):
    def must_not_migrate(*args):
        raise AssertionError('Existing remote schema was migrated again')

    monkeypatch.setattr(Database, '_migrate_conversation_metadata', must_not_migrate)
    reopened = Database(remote_db.path, remote_url=remote_db.remote_url, auth_token='fixture-token')
    assert reopened.get_setting('_databaseSchemaVersion') == 1


def test_remote_schema_marker_rejects_newer_database(remote_db):
    remote_db.set_setting('_databaseSchemaVersion', 2)
    with pytest.raises(RuntimeError, match='schema is newer'):
        Database(remote_db.path, remote_url=remote_db.remote_url, auth_token='fixture-token')


def test_remote_rows_support_name_index_dict_and_rowcount(remote_db):
    with remote_db.transaction() as connection:
        connection.executemany('INSERT INTO settings VALUES (?, ?)', [('one', '1'), ('two', '2')])
        cursor = connection.execute("SELECT key, value_json FROM settings WHERE key IN ('one', 'two') ORDER BY key")
        first = cursor.fetchone()
        assert first[0] == first['key'] == first['KEY'] == 'one'
        assert dict(first) == {'key': 'one', 'value_json': '1'}
        assert tuple(first) == ('one', '1')
        assert [dict(row) for row in cursor] == [{'key': 'two', 'value_json': '2'}]
        assert cursor.fetchone() is None
        assert connection.execute('UPDATE settings SET value_json=? WHERE key=?', ('3', 'one')).rowcount == 1
        assert connection.execute('UPDATE settings SET value_json=? WHERE key=?', ('3', 'missing')).rowcount == 0


def test_remote_script_does_not_suppress_error_or_commit(tmp_path):
    path = str(tmp_path / 'script.db')
    raw = libsql.connect(path, isolation_level=None)
    connection = Connection(raw)
    connection.execute('CREATE TABLE items (id INTEGER PRIMARY KEY, value TEXT)')
    connection.execute('BEGIN IMMEDIATE')
    with pytest.raises(Exception):
        connection.executescript("INSERT INTO items VALUES (1, 'semi;colon'); INSERT INTO missing VALUES (2);")
    connection.rollback()
    assert connection.execute('SELECT * FROM items').fetchall() == []
    connection.execute('BEGIN IMMEDIATE')
    connection.executescript("INSERT INTO items VALUES (1, 'semi;colon'); -- comment\n INSERT INTO items VALUES (2, 'next')")
    connection.commit()
    assert [tuple(row) for row in connection.execute('SELECT * FROM items ORDER BY id')] == [(1, 'semi;colon'), (2, 'next')]
    connection.close()


def test_remote_foreign_keys_are_enforced(remote_db):
    with pytest.raises(Exception):
        with remote_db.transaction() as connection:
            connection.execute("INSERT INTO evaluations(id,conversation_id,checklist_id,status,body_json) VALUES('ev','absent','absent','queued','{}')")
    assert remote_db.all_evaluations() == []


def test_remote_adapter_preserves_import_and_transcription_generation(remote_db):
    from app.checklists import seed_checklist
    from app.conversations import import_records
    from app.stt.storage import Store

    seed_checklist(remote_db)
    assert remote_db.get_checklist('active')['version'] == 1
    payload = [{'conversation_id': 'remote-call', 'channel': 'voice call', 'language': 'RU',
                'audio_url': 'https://media.dynamics.com/fixture.mp3',
                'transcript': [{'timestamp': '2026-11-03T18:10:00+05:00', 'speaker': 'client',
                                'text': 'Где найти отчёт?'}]}]
    result, ids = import_records(remote_db, payload, 'DEV')
    assert result['imported'] == 1 and ids == ['remote-call']
    stored = remote_db.get_conversation('remote-call')
    assert stored['number'] == 1
    store = Store(remote_db, False)
    assert store.enqueue(ids, 'fixture-model') == [('remote-call', 1)]
    assert store.update('remote-call', 1, status='running', step='download')
    assert not store.update('remote-call', 2, status='done')
    assert store.get('remote-call')['status'] == 'running'
    assert store.get('remote-call')['generation'] == 1
    assert store.enqueue(ids, 'fixture-model') == []


@pytest.mark.parametrize('url', ['file:///tmp/local.db', 'http://example.test', 'libsql://user:secret@db.turso.io',
                               'libsql://db.turso.io?authToken=secret', 'https://db.turso.io/path', 'missing'])
def test_remote_config_rejects_non_origin_or_local_urls(url):
    with pytest.raises(ValueError, match='TURSO_DATABASE_URL'):
        validate_remote_config(url, 'token')


def test_remote_config_requires_auth_token():
    with pytest.raises(ValueError, match='TURSO_AUTH_TOKEN'):
        validate_remote_config('libsql://db.turso.io', '')


def test_local_database_keeps_sqlite_row_contract(tmp_path):
    database = Database(tmp_path / 'local.db')
    with database.transaction() as connection:
        row = connection.execute('SELECT 42 AS value').fetchone()
        assert isinstance(row, sqlite3.Row)
        assert row['value'] == 42
