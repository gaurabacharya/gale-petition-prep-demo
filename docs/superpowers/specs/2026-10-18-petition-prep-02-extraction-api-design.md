# Spec 02: Extraction pipeline and API (Day 1, afternoon)

## Purpose

Turn uploaded documents into stored, reviewable facts.

**Done when:** uploading the 3 sample documents stores fields with quotes and confidence.

## Scope

In: Effect extraction services, Hono API, upload endpoint, demo synthetic-only guard, sample documents.
Out: review UI, consistency checks, outputs.

## Pipeline

1. **Upload (flow step 1)** `POST /cases/:id/documents` with `kind` and a text or PDF-with-text file. The text goes in `documents.raw_text`. OCR is out of scope.
2. **Passport (flow step 2a, kind = passport):** run the MRZ parser from spec 01. Write fields with `source = mrz`, `confidence = high` and the MRZ line as `quote`. The text is never sent to `LlmClient`.
3. **Degree and offer letter (flow step 2b):** redact, call `LlmClient` with a response `Schema`, validate, restore, then write fields. The demo calls Anthropic with synthetic documents only.
   - Degree: name, degree, field of study, institution, date conferred.
   - Offer letter: name, job title, duties, annual salary, start date, employer, worksite location.
4. **Confidence:** a value is `high` only if its returned `quote` appears verbatim in the document's `raw_text`. Otherwise it is `low`. A missing value is stored as a low-confidence field with an empty value, so it shows up for review.
5. **Replace and reset:** re-uploading a kind deletes its old fields, writes the new ones with `status = pending`.
6. **Audit:** log the extraction, the model used and the redaction counts.

## API (Hono)

| Route | Purpose |
| --- | --- |
| `POST /cases` | create a case with a label |
| `POST /cases/:id/documents` | upload and extract as above |
| `GET /cases` | list for the review queue (beneficiary, employer, status, document and discrepancy counts) |
| `GET /cases/:id` | documents and fields |
| `PATCH /fields/:id` | attorney correction or approval (sets `source = attorney` on edit). Built here, used by spec 03. |

Request and response bodies are validated with `Schema`. Errors are typed and the Hono layer maps each to an HTTP code with a clear message:

| Error | HTTP code |
| --- | --- |
| Invalid request body | 400 |
| Unreadable MRZ or invalid document | 422 |
| Non-`UTO` passport in demo mode | 403 |
| Case or field not found | 404 |
| Model failure or invalid model output | 502 |

## Demo guard

When `DEMO_MODE=true`, the server rejects a passport upload whose MRZ issuing country is not `UTO`. The rejection happens before any storage or model call and is written to the audit log.

## Sample documents (fixtures)

Three synthetic files for one fictional beneficiary: a specimen passport (`UTO`), a degree and an offer letter. The degree must omit the middle name, and the passport must expire close to the offer's start date, so spec 03's checks have something to catch. The same files serve as test fixtures.

## Tests

- The pipeline with the mock provider produces the expected fields from the fixtures.
- A quote not in the text gives `low` confidence.
- Re-upload replaces and resets.
- The passport route never calls `LlmClient` (assert with a mock that fails if called).
- A non-`UTO` passport is rejected in demo mode.
- Text sent to the mock contains tokens, not the original SSN or passport number.

## Open items

- Exact field names are fixed in the Effect `Schema` for each document and are the contract for spec 03 and spec 04.
- Model failure handling is one retry, then a typed error. Revisit if the demo needs more.
