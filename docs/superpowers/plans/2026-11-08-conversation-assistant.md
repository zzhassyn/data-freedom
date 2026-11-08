# Conversation assistant implementation plan

> **For agentic workers** Use superpowers:executing-plans to implement these tasks. Independent backend implementation is delegated.

**Goal** Add a chat assistant to an open conversation, launched by the user's green icon.

**Architecture** A card-scoped widget sends bounded history and identifiers to a server endpoint. The server loads the conversation and selected assessment, calls the configured AI provider and validates exact transcript citations. Existing model queue, accounting, localization and citation navigation are reused.

**Tech stack** Existing vanilla JavaScript, CSS, FastAPI and OpenRouter adapter.

**Spec** User confirmed on 2026-11-08 that the assistant explains the assessment, finds quotes and gives recommendations only for the open conversation. It opens on clicking their icon. Implementation was explicitly authorized.

## Constraints

- Work on branch `assistant` based on `darina` at `a7375f1`.
- Use `Floating Green Assistant Icon.png` as the supplied image, preserving transparency.
- Chat history lives in memory for the mounted conversation card.
- Answer language follows the existing RU/KZ/EN interface selection.
- Assistant responses do not perform data mutations.
- No external paid model calls in automated verification.

## Review focus

- Navigation while a reply is pending must prevent late responses appearing elsewhere.
- Assessment changes must invalidate history based on an older assessment.
- Historical assessments must use their own transcript snapshot.
- Citations must point to valid turns and contain exact source text.
- Keyboard operation, narrow screens and request failures must leave the chat usable.

## Task 1. Backend assistant

- [x] Add offline failing tests for the endpoint, source validation and exact citations.
- [x] Implement `POST /api/conversations/{id}/assistant` with `message`, `history`, `language`, `transcriptHash` and optional `evaluationId`.
- [x] Return validated `answer`, `citations` containing `turnIdx` and `quote`, and `usage`.
- [x] Reuse the AI adapter and queued usage-accounted calls, checking source freshness before and after inference.
- [x] Run targeted backend tests and existing AI tests.

## Task 2. Conversation card widget

- [x] Add API regression test for identifier encoding, JSON body and cancellation.
- [x] Add `web/js/assistant.js`, `web/styles/assistant.css` and supplied icon under `web/assets/`.
- [x] Integrate card mounting, evaluation updates, citation jumps and disposal, with safe text rendering and RU/KZ/EN labels.
- [x] Verify pending, failed, cleared and changed-context interactions.

## Task 3. Integration verification

- [x] Run JS tests and backend tests with offline providers.
- [x] Check desktop and narrow-screen UI against an isolated server and fixture data.
- [x] Review the resulting diff and fix confirmed issues.
- [x] Report branch, result, validation and preview address.

