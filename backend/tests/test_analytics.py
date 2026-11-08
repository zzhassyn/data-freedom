import json
import time
from copy import deepcopy

import pytest

from app import analytics, llm_switch, topics
from app.db import utcnow
from app.models import TopicAssignment
from app.scoring import score_evaluation


def _record(cid, *, timestamp='00:00', language='RU', channel='agent chat', operator='Меня зовут Айбек. Чем могу помочь?'):
    return {'conversation_id': cid, 'channel': channel, 'language': language, 'audio_url': None,
        'transcript': [{'speaker': 'operator' if operator else 'bot', 'timestamp': timestamp,
                        'text': operator or 'Здравствуйте, бот поддержки.'},
                       {'speaker': 'client', 'timestamp': timestamp, 'text': 'Не могу войти в приложение.'}]}


def _import(client, records):
    response = client.post('/api/conversations/upload', json=records)
    assert response.status_code == 200, response.text
    return {row['id']: row for row in client.app.state.db.all_conversations()}


def _evaluation(client, cid, *, checklist=None, full=True, status='done', answers=None):
    db = client.app.state.db
    checklist = checklist or db.get_checklist('active')
    conversation = db.get_conversation(cid)
    values = {c['id']: ('no' if c['type'] == 'flag' else
        max(s['value'] for s in c['scale']) if c['type'] == 'scale' and full else
        0 if c['type'] == 'scale' else 'yes' if full else 'no') for c in checklist['criteria']}
    values.update(answers or {})
    items = [{'criterionId': c['id'], 'status': 'done', 'answer': values[c['id']],
              'model': 'test-analytics', 'needsReview': False} for c in checklist['criteria']]
    scored = score_evaluation(checklist, items)
    body = {'id': db.next_id('ev'), 'conversationId': cid, 'checklistId': checklist['id'],
        'checklistVersion': checklist['version'], 'transcriptHash': conversation['transcriptHash'],
        'status': status, 'model': 'test-analytics', 'needsReviewCount': 0,
        'startedAt': utcnow(), 'finishedAt': utcnow(), 'durationMs': 1,
        **scored, 'originalTotal': scored['total']}
    if status != 'done':
        body['total'] = None
        body['items'] = []
    db.save_evaluation(body)
    return body


def _topic(client, cid, topic_id='login', outcome='unknown'):
    db = client.app.state.db
    conversation = db.get_conversation(cid)
    db.set_cache('topic', cid, {'sourceHash': conversation['transcriptHash'],
        'providerIdentity': topics.identity(client.app),
        'result': {'topicId': topic_id, 'resolutionStatus': outcome}})


def _report(client, **filters):
    query = {key: json.dumps(value) if isinstance(value, list) else value for key, value in filters.items()}
    response = client.get('/api/analytics', params=query)
    assert response.status_code == 200, response.text
    return response.json()


def test_empty_report_is_honest_and_deterministic(client):
    report = _report(client)
    assert report['scope']['total'] == 0
    assert report['coverage']['evaluated'] == report['coverage']['unevaluated'] == 0
    assert report['overview']['avgScore'] is None
    assert report['overview']['callDuration']['averageSeconds'] is None
    assert report['topics']['rows'] == report['operators'] == []
    assert report['periodComparison']['available'] is False
    assert len(report['criteria']) == 8
    assert all(row['avgFraction'] is None and row['missing'] == 0 for row in report['criteria'])
    assert _report(client)['sourceHash'] == report['sourceHash']


def test_latest_ready_is_kept_with_new_failed_attempt_and_version_isolation(client):
    _import(client, [_record('one'), _record('two')])
    db = client.app.state.db
    first = _evaluation(client, 'one')
    second_checklist = {**deepcopy(db.get_checklist('active')), 'id': 'cl_2', 'version': 2, 'isActive': False}
    db.save_checklist(second_checklist)
    _evaluation(client, 'one', checklist=second_checklist, full=False)
    failed = _evaluation(client, 'one', status='failed')
    report = _report(client)
    row = report['conversations'][0]
    assert report['coverage']['evaluated'] == 1 and report['coverage']['unevaluated'] == 1
    assert report['coverage']['failed'] == report['coverage']['readyWithNewerAttempt'] == 1
    assert row['evaluationId'] == row['qualityEvaluationId'] == first['id']
    assert row['latestEvaluationId'] == failed['id'] and row['status'] == 'failed'
    assert row['readyIsPreviousAttempt'] is True and row['total'] == 100
    assert _report(client, scoreFrom=100, status=['failed'])['scope']['conversationIds'] == ['one']
    version_two = _report(client, checklistId='cl_2')
    assert version_two['overview']['avgScore'] == 0
    assert version_two['conversations'][0]['status'] == 'done'
    # A new transcript invalidates every old-version/old-transcript score.
    _import(client, [_record('one', operator='Другой текст оператора.')])
    updated = _report(client)
    assert updated['coverage']['evaluated'] == 0
    assert updated['coverage']['stale'] == 1


def test_score_zero_no_assessment_and_exact_arbitrary_ids(client):
    _import(client, [_record('zero,with,commas'), _record('full'), _record('missing')])
    _evaluation(client, 'zero,with,commas', full=False)
    _evaluation(client, 'full')
    assert _report(client, scoreFrom=0, scoreTo=0)['scope']['conversationIds'] == ['zero,with,commas']
    assert _report(client, conversationIds=['zero,with,commas'])['scope']['total'] == 1
    assert _report(client, conversationIds=[])['scope']['total'] == 0
    assert _report(client, conversationIds=['unknown'])['scope']['total'] == 0
    assert _report(client, q='full')['scope']['conversationIds'] == ['full']
    assert _report(client, languages=['EN'])['scope']['total'] == 0


def test_local_date_endpoints_are_inclusive_without_using_import_clock(client):
    times = ['2026-11-07T18:59:59Z', '2026-11-07T19:00:00Z',
             '2026-11-08T18:59:59Z', '2026-11-08T19:00:00Z']
    _import(client, [_record(str(i), timestamp=value, channel='voice call') for i, value in enumerate(times)])
    report = _report(client, dateFrom='2026-11-08', dateTo='2026-11-08', timezoneOffsetMinutes=-300)
    assert report['scope']['conversationIds'] == ['1', '2']
    assert report['scope']['dateSourceCounts'] == {'conversation': 2, 'imported': 0, 'unknown': 0}


@pytest.mark.parametrize('filters', [
    {'scoreFrom': 90, 'scoreTo': 40}, {'scoreFrom': 'NaN'}, {'scoreTo': 101},
    {'dateFrom': '2026-11-09', 'dateTo': '2026-11-08'}, {'dateFrom': '2026-02-30'},
    {'timezoneOffsetMinutes': -900}, {'timezoneOffsetMinutes': 1.5},
    {'status': 'invented'}, {'channels': 'all'}, {'somethingElse': 'yes'},
    {'conversationIds': '[not json]'},
])
def test_invalid_filters_fail_closed(client, filters):
    response = client.get('/api/analytics', params=filters)
    assert response.status_code == 400
    assert response.json()['error']['code'] == 'invalid_filter'


def test_topics_preserve_three_outcomes_rare_and_unidentified(client):
    _import(client, [_record(str(i)) for i in range(6)])
    client.app.state.db.set_cache('topic_catalog', topics.VERSION, {'topics': [
        {'id': 'login', 'title': 'Вход в приложение'}, {'id': 'rare', 'title': 'Редкий вопрос'}]})
    for i, state in enumerate(('resolved', 'unresolved', 'unknown')):
        _topic(client, str(i), outcome=state)
    _topic(client, '3', 'rare', 'unresolved')
    _topic(client, '4', None)
    report = _report(client)
    result = {row['id']: row for row in report['topics']['rows']}
    assert report['topics']['analyzed'] == 5 and report['topics']['pending'] == 1
    assert report['topics']['unidentified'] == 1
    assert (result['login']['resolved'], result['login']['unresolved'], result['login']['unknown']) == (1, 1, 1)
    assert result['login']['known'] == 2 and result['login']['resolutionRate'] == .5
    assert result['rare']['isRare'] is True and result['rare']['conversationIds'] == ['3']
    assert report['overview']['drilldowns']['unresolved'] == ['1', '3']
    _import(client, [_record('0', operator='Обновлённый разговор')])
    assert _report(client)['topics']['analyzed'] == 4


def test_cache_read_is_batched_and_report_does_not_call_model(client, monkeypatch):
    _import(client, [_record(str(i)) for i in range(12)])
    db = client.app.state.db
    cache_calls = []
    original = db.get_caches
    def track(kind, conn=None):
        cache_calls.append(kind)
        return original(kind, conn)
    monkeypatch.setattr(db, 'get_caches', track)
    original_one = db.get_cache
    def one(kind, key, conn=None):
        assert kind != 'topic', 'per-conversation topic read'
        return original_one(kind, key, conn)
    monkeypatch.setattr(db, 'get_cache', one)
    async def forbidden(*args):
        raise AssertionError('analytics called model')
    monkeypatch.setattr(llm_switch.get_ai(), 'classify_topic', forbidden, raising=False)
    assert _report(client)['scope']['total'] == 12
    assert cache_calls == ['summary', 'topic']


def test_operator_groups_are_unverified_and_masked_names_not_reconstructed(client):
    _import(client, [_record('a'), _record('b'), _record('hidden', operator='Меня зовут [имя скрыто].'),
        _record('missing', operator='Здравствуйте. Чем могу помочь?'), _record('bot', operator=None)])
    report = _report(client)
    rows = {row['kind']: row for row in report['operators']}
    assert set(rows) == {'named', 'hidden', 'missing', 'botOnly'}
    assert rows['named']['name'] == 'Айбек' and rows['named']['count'] == 2
    assert rows['hidden']['name'] is None
    assert all(row['identityVerified'] is False and row['smallSample'] is True for row in rows.values())


def test_period_comparison_requires_true_dates_and_both_samples(client):
    records = [_record(f'prev-{i}', timestamp='2026-11-07T10:00:00Z', channel='voice call') for i in range(5)]
    records += [_record(f'now-{i}', timestamp='2026-11-08T10:00:00Z', channel='voice call') for i in range(5)]
    _import(client, records)
    for i in range(5):
        _evaluation(client, f'prev-{i}')
        _evaluation(client, f'now-{i}', full=False)
    report = _report(client, dateFrom='2026-11-08', dateTo='2026-11-08')
    comparison = report['periodComparison']
    assert comparison['available'] and comparison['deltaScore'] == -100
    assert comparison['current']['evaluated'] == comparison['previous']['evaluated'] == 5
    # Previous-period mutations must invalidate assistant context too.
    _evaluation(client, 'prev-0', full=False)
    changed = _report(client, dateFrom='2026-11-08', dateTo='2026-11-08')
    assert changed['sourceHash'] != report['sourceHash']
    assert changed['periodComparison']['deltaScore'] == -80
    # A timestamp added later cannot turn stable importedAt-based startedAt into a real conversation date.
    _import(client, [_record('imported')])
    _import(client, [_record('imported', timestamp='2026-11-08T10:00:00Z')])
    all_rows = _report(client)['conversations']
    assert next(row for row in all_rows if row['conversationId'] == 'imported')['dateSource'] == 'unknown'


def test_custom_criterion_na_and_language_counts_use_selected_version(client):
    _import(client, [_record('ru'), _record('en', language='EN'), _record('missing')])
    db = client.app.state.db
    checklist = deepcopy(db.get_checklist('active'))
    checklist.update(id='custom', version=9, isActive=False)
    criterion = checklist['criteria'][1]
    criterion.update(id='custom-answer', title='Новое правило')
    checklist['criteria'] = [criterion]
    db.save_checklist(checklist)
    _evaluation(client, 'ru', checklist=checklist, full=False)
    _evaluation(client, 'en', checklist=checklist, answers={'custom-answer': 'na'})
    report = _report(client, checklistId='custom')
    assert len(report['criteria']) == 1
    item = report['criteria'][0]
    assert item['id'] == 'custom-answer'
    assert (item['applicable'], item['na'], item['missing']) == (1, 1, 1)
    assert item['belowTargetIds'] == ['ru'] and item['avgFraction'] == 0
    assert item['byLanguage']['EN']['na'] == 1 and item['byLanguage']['EN']['avgFraction'] is None
    assert report['coverage']['evaluated'] == 2
    assert report['overview']['scoredCount'] == 1
    operator = report['operators'][0]
    assert operator['evaluated'] == 2 and operator['scoredCount'] == 1


def test_scoped_topic_analysis_never_widens_empty_or_explicit_ids(client, monkeypatch):
    _import(client, [_record('one'), _record('two')])
    calls = []
    async def classify(conversation, catalog):
        calls.append(conversation.id)
        return TopicAssignment(new_title='Вход в приложение', resolution_status='unknown')
    monkeypatch.setattr(llm_switch.get_ai(), 'classify_topic', classify, raising=False)
    assert client.post('/api/topics/analyze', json={'conversationIds': []}).json()['total'] == 0
    assert calls == []
    assert client.post('/api/topics/analyze', json={'conversationIds': ['unknown']}).status_code == 400
    response = client.post('/api/topics/analyze', json={'conversationIds': ['one']})
    assert response.status_code == 200 and response.json()['total'] == 1
    deadline = time.monotonic() + 3
    while time.monotonic() < deadline and client.get('/api/topics').json()['job']['status'] == 'running':
        time.sleep(.01)
    assert calls == ['one']
    report = _report(client)
    assert report['topics']['analyzed'] == report['topics']['pending'] == 1


def test_running_topic_subset_does_not_claim_to_cover_all_or_expose_other_ids(client):
    _import(client, [_record('one'), _record('two')])
    client.app.state.settings.worker_mode = 'api'
    assert client.post('/api/topics/analyze', json={'conversationIds': ['one']}).status_code == 200
    assert client.post('/api/topics/analyze', json={}).status_code == 409
    assert client.post('/api/topics/analyze', json={'conversationIds': ['one']}).status_code == 200
    assert client.post('/api/topics/analyze', json={'conversationIds': []}).json()['status'] == 'done'
    assert client.get('/api/topics').json()['job']['status'] == 'running'
    job = _report(client, conversationIds=['two'])['topics']['job']
    assert job['scope'] == 'global' and job['selectedCount'] == 0
    assert 'conversationIds' not in job


def test_audio_metadata_changes_source_hash_but_job_progress_does_not(client):
    _import(client, [_record('call', channel='voice call', timestamp='2026-11-08T10:00:00Z')])
    before = _report(client)
    db = client.app.state.db
    conversation = db.get_conversation('call')
    with db.transaction() as conn:
        conn.execute('INSERT INTO transcriptions (conversation_id,transcript_hash,status,step,model,'
            'audio_seconds_declared,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)',
            ('call', conversation['transcriptHash'], 'done', 'done', 'scribe', 90, utcnow(), utcnow()))
    after = _report(client)
    assert after['sourceHash'] != before['sourceHash']
    assert after['overview']['callDuration']['averageSeconds'] == 90
    client.app.state.settings.worker_mode = 'api'
    client.post('/api/topics/analyze', json={'conversationIds': ['call']})
    assert _report(client)['sourceHash'] == after['sourceHash']


def test_appeal_record_counts_distinct_conversations_and_filter_intersections(client):
    _import(client, [_record('flagged'), _record('low'), _record('new')])
    db = client.app.state.db
    flagged = _evaluation(client, 'flagged', answers={'gross': 'yes'})
    flagged['needsReviewCount'] = 2
    db.save_evaluation(flagged)
    low = _evaluation(client, 'low', full=False)
    for i, (ev, status) in enumerate(((flagged, 'open'), (flagged, 'open'), (flagged, 'confirmed'), (low, 'changed'))):
        db.save_appeal({'id': f'appeal-{i}', 'evaluationId': ev['id'], 'criterionId': ('closing', 'contact', 'needs', 'closing')[i],
                       'status': status, 'createdAt': utcnow()})
    report = _report(client)
    assert report['overview']['openAppealCount'] == 2
    assert report['overview']['openAppealConversations'] == 1
    assert report['overview']['attentionCount'] == 2
    assert report['overview']['appeals'] == {'total': 4, 'open': 2, 'confirmed': 1, 'changed': 1,
        'conversationIds': ['flagged', 'low'], 'openIds': ['flagged'], 'confirmedIds': ['flagged'], 'changedIds': ['low']}
    assert _report(client, attention=['gross', 'review'])['scope']['conversationIds'] == ['flagged']
    assert _report(client, appealStatus=['none'])['scope']['conversationIds'] == ['new']
    assert _report(client, appealStatus=['resolved'])['scope']['conversationIds'] == ['flagged', 'low']
    assert _report(client, appealStatus=['open'], scoreFrom=100)['scope']['conversationIds'] == ['flagged']


def test_answer_distribution_sections_and_exact_ids_follow_selected_checklist(client):
    _import(client, [_record(cid, language='EN' if cid == 'na' else 'RU')
                     for cid in ('full', 'partial', 'zero', 'na', 'missing')])
    db = client.app.state.db
    checklist = deepcopy(db.get_checklist('active'))
    checklist.update(id='distribution', version=12, isActive=False)
    criterion = next(item for item in checklist['criteria'] if item['type'] == 'scale')
    criterion.update(id='custom-scale', sectionId='new-section', order=17,
                     scale=[{'value': 0, 'description': 'Нет'}, {'value': 3, 'description': 'Частично'},
                            {'value': 8, 'description': 'Полностью'}], naAllowed=True)
    checklist['criteria'] = [criterion]
    checklist['sections'] = [{'id': 'new-section', 'title': 'Раздел другой версии', 'order': 9}]
    db.save_checklist(checklist)
    for cid, answer in (('full', 8), ('partial', 3), ('zero', 0), ('na', 'na')):
        _evaluation(client, cid, checklist=checklist, answers={'custom-scale': answer})
    result = _report(client, checklistId=checklist['id'])['criteria'][0]
    assert (result['sectionId'], result['sectionTitle'], result['sectionOrder'], result['order']) == (
        'new-section', 'Раздел другой версии', 9, 17)
    assert result['answerCounts'] == {'yes': 1, 'partial': 1, 'no': 1, 'na': 1}
    assert result['answerIds'] == {'yes': ['full'], 'partial': ['partial'], 'no': ['zero'], 'na': ['na']}
    assert result['missing'] == 1 and result['assessed'] == 4
    assert result['byLanguage']['EN']['answerCounts'] == {'yes': 0, 'partial': 0, 'no': 0, 'na': 1}
    assert result['byLanguage']['RU']['answerCounts']['partial'] == 1
