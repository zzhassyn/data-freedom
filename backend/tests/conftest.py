import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.settings import Settings


@pytest.fixture
def dev_payload():
    return json.loads((Path(__file__).parent / 'data' / 'dev.json').read_text(encoding='utf-8-sig'))


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv('JUDGE', 'fake')
    app = create_app(Settings(db_path=str(tmp_path / 'test.sqlite'), judge='fake', fake_delay=0.001, auto_summarize=False))
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def seeded_client(client, dev_payload):
    response = client.post('/api/conversations/upload', json=dev_payload)
    assert response.status_code == 200, response.text
    assert response.json()['total'] == 65
    return client
