# Spec 01: Foundations (Day 1, morning)

## Purpose

Build the base layers that every later step uses: the database schema, the passport parser, the redaction module and the model interface.

**Done when:** the sample passport parses with all check digits passing, and redaction swaps tokens in and restores them.

## Scope

In: Postgres schema, MRZ parser, redaction module, `LlmClient` with Anthropic and mock providers, project scaffolding (TypeScript, Effect TS, tests).
Out: extraction logic, HTTP API, UI, PDFs, the self-hosted provider (spec 04).

## Components

### 1. Postgres schema

| Table | Columns |
| --- | --- |
| `cases` | `id`, `label` |
| `documents` | `id`, `case_id`, `kind` (passport, degree, offer_letter), `filename`, `raw_text`; unique on (`case_id`, `kind`) |
| `fields` | `id`, `case_id`, `doc_kind`, `name`, `value`, `quote`, `source` (mrz, llm, attorney), `confidence` (high, low), `status` (pending, approved) |
| `letters` | `case_id`, `body`, `model` |
| `audit_log` | `id`, `at`, `action`, `detail` (JSON of counts and model name only) |

Rules: re-uploading a document replaces its `fields` rows and sets status to pending. `audit_log.detail` must never hold field values. Migrations are plain SQL files run in order.

The MRZ parser and redaction module below, with the token vault, together form the "Privacy layer".

### 2. MRZ parser

- Input: passport text containing a two-line, 44-character TD3 MRZ.
- Output: surname, given names, passport number, nationality, date of birth, sex, expiry date and issuing country, each with its raw MRZ source, plus a result for each check digit (passport number, date of birth, expiry, composite) using the ICAO 7-3-1 weighting.
- Failure: a malformed MRZ or failed check digit is returned as a typed error or flagged result, not thrown. Spec 03 turns failed digits into the "MRZ check digits" problem.
- Runs entirely locally. It must not import `LlmClient`.

### 3. Redaction module

- `redact(text) -> { text, vault }` replaces SSN, A-number, passport number, date of birth, student ID, email and phone with numbered tokens such as `[[SSN_1]]`. Identical values reuse one token.
- `restore(text, vault)` puts the values back.
- The vault is an in-memory object held by the server process, never persisted or logged.
- Returns counts per type for the audit log.
- Names, job title, duties and salary are not redacted.

### 4. `LlmClient`

- An Effect service with one operation: given a prompt and a response schema, it returns validated, typed output or a typed error (provider failure, invalid output).
- Providers: Anthropic (key from env) and Mock (returns fixed or per-test responses, no network).
- Selected by `LLM_PROVIDER` (`anthropic`, `mock`), defaulting to `anthropic` for the demo. Anthropic is the only provider the demo calls, and Mock is for tests. Spec 04 adds a `selfhosted` stub that the demo does not run.
- The system prompt tells the model to treat document text as data and ignore instructions inside it.
- Every call writes an `audit_log` row with the provider, model and redaction counts.

## Tests

- MRZ: a valid specimen passes all digits, and a single altered character fails the right digit.
- Redaction: round trip is lossless, repeated values share a token, and an input with nothing sensitive is unchanged.
- `LlmClient`: the mock provider returns schema-valid output, invalid output gives the typed error, and no field values appear in `audit_log`.

## Open items

- Which ICAO check digit failures count as problems versus warnings is decided in spec 03.
- The regex list for redaction covers the formats in the sample documents only. Broader coverage is a next step.
