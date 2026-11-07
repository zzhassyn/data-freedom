"""Shared ML/domain schemas. Python uses snake_case, HTTP uses camelCase."""
import re
from typing import Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, StrictFloat, StrictInt, field_validator
from pydantic.alias_generators import to_camel


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, allow_inf_nan=False)


Answer = Union[Literal['yes', 'no', 'na'], StrictInt, StrictFloat]


class Turn(ApiModel):
    idx: int = Field(ge=0)
    timestamp: str
    t_sec: float
    speaker: Literal['client', 'operator', 'bot', 'system']
    text: str = Field(min_length=1)


class Conversation(ApiModel):
    id: str
    number: Optional[int] = Field(default=None, ge=1)
    started_at: Optional[str] = None
    dataset_group_id: str
    channel: Literal['agent chat', 'voice call']
    language: Literal['RU', 'KZ', 'EN']
    audio_url: Optional[str] = None
    transcript: list[Turn]
    imported_at: str


class ScaleStep(ApiModel):
    value: float
    description: str


class FlagType(ApiModel):
    id: str
    title: str


class Section(ApiModel):
    id: str
    title: str
    order: int


class Criterion(ApiModel):
    id: str
    section_id: str
    order: int
    title: str
    description: str
    type: Literal['binary', 'scale', 'flag']
    weight: float
    na_allowed: bool
    na_condition: Optional[str] = None
    scale: Optional[list[ScaleStep]] = None
    flag_types: Optional[list[FlagType]] = None
    hash: str = ''
    content_hash: str = ''


class Checklist(ApiModel):
    id: str
    version: int
    name: str
    based_on_version: Optional[int] = None
    is_active: bool
    created_at: str
    sections: list[Section]
    criteria: list[Criterion]


class Evidence(ApiModel):
    turn_idx: int = Field(ge=0)
    quote: str = Field(max_length=200)
    kind: Literal['supports', 'expected_here']


class Usage(ApiModel):
    input_tokens: int = Field(default=0, ge=0)
    output_tokens: int = Field(default=0, ge=0)
    cost_usd: float = Field(default=0, ge=0)
    calls: int = Field(default=0, ge=0)


class AssistantCitation(ApiModel):
    model_config = ConfigDict(extra='forbid')
    turn_idx: StrictInt = Field(ge=0)
    quote: str = Field(min_length=1, max_length=500)


class AssistantReply(ApiModel):
    model_config = ConfigDict(extra='forbid')
    answer: str = Field(min_length=1, max_length=6000)
    citations: list[AssistantCitation] = Field(max_length=8)
    usage: Usage = Field(default_factory=Usage)

    @field_validator('answer')
    @classmethod
    def plain_answer(cls, value):
        value = value.strip()
        if not value or re.search(r'<\s*(?:/?[A-Za-z][^>]*|![^>]*|\?[^>]*)>', value):
            raise ValueError('invalid_assistant_answer')
        return value

    def validate_citations(self, conversation):
        turns = {turn.idx: turn.text for turn in conversation.transcript}
        for citation in self.citations:
            if (citation.turn_idx not in turns or not citation.quote.strip()
                    or citation.quote not in turns[citation.turn_idx]):
                raise ValueError('invalid_assistant_citation')
        return self


class JudgeResult(ApiModel):
    answer: Answer
    explanation: str
    evidence: list[Evidence] = Field(default_factory=list)
    checked_range: Optional[tuple[int, int]] = None
    na_reason: Optional[str] = None
    flag_types: Optional[list[str]] = None
    needs_review: bool = False
    model: str
    usage: Usage = Field(default_factory=Usage)
    latency_ms: int = Field(default=0, ge=0)


class SecondOpinion(ApiModel):
    answer: Answer
    agrees_with_appeal: bool
    explanation: str
    evidence: list[Evidence] = Field(default_factory=list)
    usage: Usage = Field(default_factory=Usage)


class Summary(ApiModel):
    topic: str
    request: str
    outcome: str
    operator_name: Optional[str] = None
    usage: Usage = Field(default_factory=Usage)


class TranslatedTurn(ApiModel):
    idx: int
    text: str


class Translation(ApiModel):
    turns: list[TranslatedTurn]
    usage: Usage = Field(default_factory=Usage)


class Tip(ApiModel):
    criterion_id: str
    tip: str
    example: str


class CriterionSuggestion(ApiModel):
    description: str
    na_condition: Optional[str] = None
    scale: Optional[list[ScaleStep]] = None


class CheckedRange(ApiModel):
    from_idx: int
    to_idx: int


class Original(ApiModel):
    answer: Answer
    points: float
    effective_weight: float


class CriterionResult(ApiModel):
    criterion_id: str
    criterion_hash: str
    status: Literal['pending', 'running', 'done', 'failed']
    model: Optional[str] = None
    latency_ms: Optional[int] = Field(default=None, ge=0)
    answer: Optional[Answer] = None
    explanation: Optional[str] = None
    evidence: list[Evidence] = Field(default_factory=list)
    checked_range: Optional[CheckedRange] = None
    na_reason: Optional[str] = None
    flag_types: Optional[list[str]] = None
    reused: bool = False
    needs_review: bool = False
    usage: Optional[Usage] = None
    fraction: Optional[float] = None
    weight: float = 0
    effective_weight: float = 0
    points: float = 0
    original: Optional[Original] = None
    appeal_id: Optional[str] = None


class SectionScore(ApiModel):
    section_id: str
    earned: float
    max: float


class GrossError(ApiModel):
    flagged: bool
    types: list[str]
    criterion_id: str


class Evaluation(ApiModel):
    id: str
    conversation_id: str
    checklist_id: str
    checklist_version: int
    status: Literal['queued', 'running', 'done', 'failed']
    model: str
    usage: Usage
    needs_review_count: int
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    duration_ms: Optional[int] = None
    items: list[CriterionResult]
    sections: Optional[list[SectionScore]] = None
    total: Optional[float] = None
    original_total: Optional[float] = None
    gross_error: GrossError
    transcript_hash: str = ''


class Decision(ApiModel):
    action: Literal['confirm', 'change']
    new_answer: Optional[Answer] = None
    reason: str
    decided_at: str


class Appeal(ApiModel):
    id: str
    evaluation_id: str
    conversation_id: str
    criterion_id: str
    comment: str
    proposed_answer: Optional[Answer] = None
    created_at: str
    status: Literal['open', 'confirmed', 'changed']
    original_answer: Answer
    original_points: float
    decision: Optional[Decision] = None
    total_before: Optional[float] = None
    total_after: Optional[float] = None
    second_opinion: Optional[SecondOpinion] = None
