"""Direct libSQL connections with the small sqlite3 surface used by Database.

No embedded replica or local write buffer is used: every connection addresses
the shared Turso primary, so API instances and the worker see committed work.
"""
import sqlite3
import threading
import re
from urllib.parse import urlsplit


# The native libsql calls hold the GIL while waiting for remote SQLite locks.
# Without this process-wide guard, a second request thread can block in BEGIN
# while preventing the first thread from issuing COMMIT. Independent serverless
# processes still coordinate through the primary's BEGIN IMMEDIATE transaction.
TRANSACTION_LOCK = threading.RLock()


class ReadCursor:
    """Expose result access without a cursor.execute escape hatch."""

    def __init__(self, cursor):
        self._cursor = cursor

    @property
    def description(self):
        return self._cursor.description

    @property
    def rowcount(self):
        return self._cursor.rowcount

    def fetchone(self):
        return self._cursor.fetchone()

    def fetchall(self):
        return self._cursor.fetchall()

    def __iter__(self):
        return iter(self._cursor)


class ReadConnection:
    """A SELECT-only view of a connection owned by Database.read_connection.

    This intentionally does not admit WITH, PRAGMA or SQL scripts: application
    reads use SELECT, and a permissive prefix check could admit a write there.
    """

    def __init__(self, connection):
        self._connection = connection

    def execute(self, sql, parameters=()):
        if not isinstance(sql, str) or not re.match(r'\s*SELECT\b', sql, re.IGNORECASE):
            raise sqlite3.OperationalError('read-only connection accepts one SELECT statement')
        statement = ''
        for index, character in enumerate(sql):
            statement += character
            if character == ';' and sqlite3.complete_statement(statement):
                if sql[index + 1:].strip():
                    raise sqlite3.OperationalError('read-only connection accepts one SELECT statement')
                break
        return ReadCursor(self._connection.execute(sql, parameters))

    def executemany(self, *args, **kwargs):
        raise sqlite3.OperationalError('read-only connection accepts one SELECT statement')

    def executescript(self, *args, **kwargs):
        raise sqlite3.OperationalError('read-only connection accepts one SELECT statement')


class Row:
    """Keep sqlite3.Row's name/index access and dict(row) behavior."""

    def __init__(self, columns, values):
        self._columns = columns
        self._values = values
        self._indexes = {column.casefold(): index for index, column in reversed(list(enumerate(columns)))}

    def __getitem__(self, key):
        if isinstance(key, str):
            try:
                key = self._indexes[key.casefold()]
            except KeyError:
                raise IndexError('No item with that key') from None
        return self._values[key]

    def __len__(self):
        return len(self._values)

    def __iter__(self):
        return iter(self._values)

    def keys(self):
        return list(self._columns)


class Cursor:
    def __init__(self, cursor):
        self._cursor = cursor
        self._columns = tuple(item[0] for item in (cursor.description or ()))
        self._done = False

    @property
    def rowcount(self):
        return self._cursor.rowcount

    @property
    def description(self):
        return self._cursor.description

    def fetchone(self):
        if self._done:
            return None
        values = self._cursor.fetchone()
        if values is None:
            self._done = True
        return None if values is None else Row(self._columns, values)

    def fetchall(self):
        if self._done:
            return []
        values = self._cursor.fetchall() or []
        self._done = True
        return [Row(self._columns, row) for row in values]

    def __iter__(self):
        while (row := self.fetchone()) is not None:
            yield row


class Connection:
    def __init__(self, connection):
        self._connection = connection

    def execute(self, sql, parameters=()):
        return Cursor(self._connection.execute(sql, tuple(parameters)))

    def executemany(self, sql, parameters):
        return Cursor(self._connection.executemany(sql, [tuple(row) for row in parameters]))

    def executescript(self, script):
        # libsql 0.1.11's executescript suppresses errors. Execute each complete
        # SQL statement explicitly, without committing the caller's transaction.
        statement = ''
        for character in script:
            statement += character
            if character == ';' and sqlite3.complete_statement(statement):
                if statement.strip():
                    self.execute(statement)
                statement = ''
        if statement.strip():
            self.execute(statement)

    def commit(self):
        self._connection.commit()

    def rollback(self):
        self._connection.rollback()

    def close(self):
        self._connection.close()


def validate_remote_config(url, auth_token):
    try:
        parsed = urlsplit(url)
        valid = (parsed.scheme in {'libsql', 'https'} and bool(parsed.hostname)
                 and parsed.username is None and parsed.password is None
                 and parsed.path in {'', '/'} and not parsed.query and not parsed.fragment)
    except ValueError:
        valid = False
    if not valid:
        raise ValueError('TURSO_DATABASE_URL must be a libsql:// or https:// database origin')
    if not isinstance(auth_token, str) or not auth_token.strip():
        raise ValueError('TURSO_AUTH_TOKEN is required with TURSO_DATABASE_URL')


def connect_remote(url, auth_token):
    import libsql
    # isolation_level=None disables implicit BEGIN. Database owns explicit
    # read/write transactions; a single-query read remains in autocommit mode.
    connection = libsql.connect(database=url, auth_token=auth_token,
                                timeout=15, isolation_level=None)
    return Connection(connection)
