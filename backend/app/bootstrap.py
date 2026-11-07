"""Fresh screen data in one consistent read, with no provider requests."""
from fastapi import APIRouter, Request, Response

from .appeals import build_appeals_payload
from .conversations import registry_payload
from .evaluations import is_evaluation_visible, public_evaluation
from .extras import get_cached_summaries
from .judge.hints import contextual_na_metadata
from .models import Conversation

router = APIRouter(prefix='/api')


@router.get('/bootstrap')
def bootstrap(request: Request, response: Response):
    db = request.app.state.db
    with db.read_connection() as conn:
        conversations = db.all_conversations(conn)
        evaluations = db.all_evaluations(conn)
        checklists = db.all_checklists(conn)
        appeals = db.all_appeals(conn)
        summaries = get_cached_summaries(db, conversations, conn)
    ids = {conversation['id'] for conversation in conversations}
    latest = {}
    for evaluation in evaluations:
        if evaluation['conversationId'] in ids and is_evaluation_visible(evaluation):
            latest.setdefault(evaluation['conversationId'], evaluation)
    details = []
    for conversation in reversed(conversations):
        value = Conversation.model_validate(conversation).model_dump(by_alias=True)
        value.update(contextual_na_metadata(value))
        details.append(value)
    response.headers['Cache-Control'] = 'no-store'
    return {'schemaVersion': 1,
            'registry': registry_payload(conversations, evaluations, appeals, summaries),
            'conversations': details,
            'evaluations': [public_evaluation(value) for value in latest.values()],
            'checklists': sorted(checklists, key=lambda value: value['version'], reverse=True),
            'appeals': build_appeals_payload(appeals, evaluations, checklists, conversations, status='all', include_context=True)}
