"""Pure selections over one already-loaded read snapshot."""
from .evaluations import is_evaluation_visible


def latest_ready(evaluations, conversations, checklist_id, group_id=None):
    latest = {}
    for evaluation in evaluations:
        conversation = conversations.get(evaluation['conversationId'])
        if (conversation and (not group_id or conversation['datasetGroupId'] == group_id)
                and is_evaluation_visible(evaluation) and evaluation['status'] == 'done'
                and evaluation['checklistId'] == checklist_id
                and evaluation.get('transcriptHash') == conversation.get('transcriptHash')):
            latest.setdefault(evaluation['conversationId'], evaluation)
    return list(latest.values())
