"""Public transcription API; evaluation always keeps the organizer transcript."""
from fastapi import APIRouter, Request, Body
from pydantic import BaseModel

router = APIRouter(prefix='/api')


class RetryBody(BaseModel):
    force: bool = False


@router.get('/stt/jobs')
async def jobs(request: Request, groupId: str = ''):
    return request.app.state.stt.jobs(groupId)


@router.get('/conversations/{id}/transcription')
async def transcription(id: str, request: Request):
    return request.app.state.stt.transcription(id)


@router.post('/conversations/{id}/transcription/retry', status_code=202)
async def retry(id: str, request: Request, body: RetryBody = Body(default=RetryBody())):
    return request.app.state.stt.retry(id, force=body.force)
