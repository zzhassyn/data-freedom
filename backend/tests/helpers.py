import time

from app import llm_switch
from app.main import create_app as create_runtime_app
from tests.providers import PROVIDERS


def create_app(settings=None):
    return create_runtime_app(settings, providers=PROVIDERS)


def use_runtime_providers(settings=None):
    llm_switch.configure('openrouter', settings=settings)


def use_test_providers(settings=None):
    llm_switch.configure('openrouter', settings=settings, providers=PROVIDERS)


def evaluate(client, ids=None, checklist_id='cl_1', reuse=False):
    ids = ids or ['p1-ru-001']
    response = client.post('/api/evaluations', json={'conversationIds': ids, 'checklistId': checklist_id, 'reuse': reuse})
    assert response.status_code == 202, response.text
    created = response.json()
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        job = client.get('/api/jobs/' + created['jobId']).json()
        if job['status'] in {'done', 'failed'}:
            return [client.get('/api/evaluations/' + created['evaluationIds'][id]).json() for id in ids]
        time.sleep(0.01)
    raise AssertionError('Evaluation job did not finish: ' + str(job))


def example_items(checklist):
    from app.evaluations import empty_item
    answers = dict(contact='yes', needs='na', identification='yes', consultation=15, empathy='yes', dialogue=7, closing='no', gross='no')
    return [{**empty_item(c), 'status': 'done', 'answer': answers[c['id']]} for c in checklist['criteria']]
