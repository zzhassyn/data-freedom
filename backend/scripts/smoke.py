"""Live acceptance journey, all HTTP requests executed by curl (server required)."""
import argparse
import csv
import io
import json
import shutil
import subprocess
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--base-url', default='http://127.0.0.1:8000')
    args = parser.parse_args()
    OUT.mkdir(exist_ok=True)
    curl = shutil.which('curl.exe') or shutil.which('curl')
    if not curl:
        raise SystemExit('curl is required')
    report = {'checks': []}
    sequence = 0

    def request(path, method='GET', body=None, headers=None, binary=False, timeout=130):
        nonlocal sequence
        sequence += 1
        output = OUT / f'{sequence:03d}-response.bin'
        header_file = OUT / f'{sequence:03d}-headers.txt'
        command = [curl, '--silent', '--show-error', '--max-time', str(timeout), '-X', method,
                   '-D', str(header_file), '-o', str(output), '-w', '%{http_code}', args.base_url + path]
        if body is not None:
            payload = OUT / f'{sequence:03d}-request.json'
            payload.write_text(json.dumps(body, ensure_ascii=False), encoding='utf-8')
            command += ['-H', 'Content-Type: application/json', '--data-binary', '@' + str(payload)]
        for key, value in (headers or {}).items():
            command += ['-H', key + ': ' + value]
        completed = subprocess.run(command, capture_output=True, check=True)
        status = int(completed.stdout)
        data = output.read_bytes()
        result = data if binary else json.loads(data)
        return status, result, header_file.read_text(encoding='utf-8')

    def check(label, detail):
        report['checks'].append({'check': label, 'result': detail})
        print(json.dumps(report['checks'][-1], ensure_ascii=True), flush=True)
        (OUT / 'smoke-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')

    status, health, _ = request('/api/health')
    assert status == 200 and health['ok']
    check('health', health)
    status, imported, _ = request('/api/datasets/import', 'POST', {'groupId': 'DEV'})
    if status == 200:
        group = 'DEV'
        check('live organizer import', imported)
    else:
        check('live organizer unavailable; fallback', {'http': status, 'error': imported})
        source = json.loads((ROOT / 'tests/data/dev.json').read_text(encoding='utf-8-sig'))
        status, imported, _ = request('/api/conversations/upload', 'POST', source)
        group = 'UPLOAD'
        assert status == 200, imported
        check('file import', imported)
    assert imported['total'] == 65
    status, listed, _ = request('/api/conversations?groupId=' + group)
    assert status == 200 and len(listed['items']) == 65
    status, filtered, _ = request('/api/conversations?groupId=' + group + '&language=EN&q=p1-en')
    assert status == 200 and len(filtered['items']) == 15
    check('registry and filters', {'all': len(listed['items']), 'english': len(filtered['items'])})

    ids = ['p1-ru-001', 'p1-ru-007', 'p1-kz-003', 'p1-en-002', 'p4-ru-001']
    def evaluate(checklist_id, reuse):
        status, submitted, _ = request('/api/evaluations', 'POST', {'conversationIds': ids, 'checklistId': checklist_id, 'reuse': reuse})
        assert status == 202, submitted
        deadline = time.monotonic() + 180
        while time.monotonic() < deadline:
            status, job, _ = request('/api/jobs/' + submitted['jobId'])
            assert status == 200
            if job['status'] != 'running':
                break
            time.sleep(0.4)
        assert job['status'] == 'done' and job['done'] == 5, job
        results = [request('/api/evaluations/' + submitted['evaluationIds'][id])[1] for id in ids]
        return job, results

    job, evaluations = evaluate('cl_1', False)
    check('five fixture evaluations', {'job': job['id'], 'done': job['done'], 'totals': {ev['conversationId']: ev['total'] for ev in evaluations}})
    status, reviewed, _ = request('/api/conversations?status=review&groupId=' + group)
    assert status == 200 and len(reviewed['items']) == 2
    check('review and ribbon', {'review': len(reviewed['items']), 'ribbonItems': len(reviewed['items'][0]['lastEvaluation']['ribbon'])})

    status, appeal, _ = request('/api/appeals', 'POST', {'evaluationId': evaluations[0]['id'], 'criterionId': 'closing', 'comment': 'Клиент подтвердил решение вопроса; прощание завершает разговор.', 'proposedAnswer': 'yes'})
    assert status == 201, appeal
    status, decided, _ = request('/api/appeals/' + appeal['id'] + '/decision', 'POST', {'action': 'change', 'newAnswer': 'yes', 'reason': 'Проверяющий учёл подтверждение клиента и завершение разговора.'})
    assert status == 200 and decided['evaluation']['total'] == 100, decided
    check('appeal decision', {'before': decided['evaluation']['originalTotal'], 'after': decided['evaluation']['total']})

    status, base, _ = request('/api/checklists/cl_1')
    body = {key: base[key] for key in ('name','sections','criteria')}
    body.update(basedOnVersion=1, isActive=False)
    next(c for c in body['criteria'] if c['id'] == 'closing')['weight'] = 10
    status, version, _ = request('/api/checklists', 'POST', body)
    assert status == 201, version
    reused_job, reused = evaluate(version['id'], True)
    assert reused_job['usage']['calls'] == 0
    assert all(all(item['reused'] for item in ev['items']) for ev in reused)
    status, comparison, _ = request('/api/checklists/' + version['id'] + '/compare?against=cl_1&groupId=' + group)
    assert status == 200 and len(comparison['items']) == 5
    check('new version, reuse and compare', {'version': version['version'], 'usage': reused_job['usage'], 'summary': comparison['summary']})

    status, exported, headers = request('/api/export?format=csv&checklistId=cl_1&groupId=' + group, binary=True)
    assert status == 200 and exported.startswith(b'\xef\xbb\xbf') and 'Content-Disposition'.lower() in headers.lower()
    rows = list(csv.DictReader(io.StringIO(exported.decode('utf-8-sig'))))
    assert len(rows) == 40
    closing = next(r for r in rows if r['conversation_id'] == ids[0] and r['criterion_id'] == 'closing')
    assert closing['answer'] == 'no' and closing['final_answer'] == 'yes'
    (OUT / 'export.csv').write_bytes(exported)
    status, exported_json, _ = request('/api/export?format=json&checklistId=cl_1&groupId=' + group)
    assert status == 200 and len(exported_json) == 5
    check('CSV BOM and JSON export', {'csvRows': len(rows), 'jsonConversations': len(exported_json)})

    for path in ('/api/stats?checklistId=cl_1', '/api/operators?checklistId=cl_1', '/api/conversations/p1-kz-003/translation', '/api/conversations/p1-ru-007/summary'):
        status, result, _ = request(path)
        assert status == 200, result
        check(path, {'http': status})

    status, audio, headers = request('/api/conversations/p4-ru-001/audio', headers={'Range': 'bytes=0-1023'}, binary=True, timeout=130)
    check('live audio Range', {'http': status, 'bytes': len(audio), 'contentRange': next((line for line in headers.splitlines() if line.lower().startswith('content-range:')), None)})
    assert status == 206 and len(audio) == 1024 and 'content-range: bytes 0-1023/' in headers.lower(), headers
    print('All live curl checks passed.', flush=True)


if __name__ == '__main__':
    main()
