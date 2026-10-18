# Petition Prep

Petition Prep turns an employee's passport, degree and offer letter into attorney-approved H-1B petition data, without sending sensitive identifiers to a third-party model. The model drafts and extracts, deterministic code checks, and an attorney approves every fact before any output exists.

> **Demo mode: synthetic data only.** This build sends text to Claude via the Anthropic API. Real case files would use a self-hosted model.

For this demo I'm using Claude with fake data. In a real workflow, client documents would go to a local model running on our own servers, and the code is already built so that's a config switch.

## How it works

1. **Upload** a passport, a degree and an offer letter to a case.
2. **Extract.** The passport is parsed locally from its machine-readable zone (MRZ) with ICAO check digits validated, and never reaches a model. The degree and offer letter go through the model with sensitive identifiers tokenised first.
3. **Check.** Plain code compares the documents: missing documents, name mismatches, passport validity, MRZ digits, salary, and low-confidence fields. Judgement calls are left to the attorney.
4. **Review.** The attorney corrects and approves each fact beside its source quote.
5. **Output.** Once every fact is approved and no problem checks remain, generate the petition data sheet (PDF) and a support letter draft.

## Setup

Requires Node 20+ and Postgres.

```bash
npm install
cp .env.example .env        # then fill in DATABASE_URL and ANTHROPIC_API_KEY
npm run migrate
npm run build:web           # builds the review UI into web/dist
npm start                   # API and UI on http://localhost:3000
```

For UI development run `npm start` and `npm run dev:web` side by side (the Vite dev server proxies to the API).

### Environment variables

| Variable | Purpose |
| --- | --- |
| `LLM_PROVIDER` | `anthropic` (default), `selfhosted` or `mock` |
| `ANTHROPIC_API_KEY` | Required for `anthropic` |
| `ANTHROPIC_MODEL` | Optional model override (default `claude-sonnet-5-5`) |
| `LLM_SERVER_URL` | Required for `selfhosted`: base URL of an OpenAI-compatible chat endpoint, such as vLLM |
| `LLM_MODEL` | Optional model name sent to the self-hosted server |
| `DEMO_MODE` | `true` by default. Rejects any passport whose MRZ country is not `UTO` |
| `DATABASE_URL` | Postgres connection string |
| `PORT` | Server port (default 3000) |

## Try it with the fixtures

`test/fixtures` holds a synthetic specimen passport (country `UTO`), a degree and an offer letter for a fictional employer. The degree and offer letter name omit a middle name, and the passport expires within six months of the start date, so the checks have real discrepancies to show. Upload the three texts to a new case in the UI, review each fact, accept them all, then generate the outputs.

## Privacy layers

Each layer works on its own, so a mistake in one does not expose everything.

| Data | Handling | Model sees it? |
| --- | --- | --- |
| Passport (all fields) | Parsed locally from the MRZ, check digits validated | Never |
| SSN, A-number, passport no., date of birth, student ID, email, phone in other documents | Replaced with tokens like `[[SSN_1]]` before the call, restored after; the token vault stays in the server process | No, only the token |
| Names, job title, duties, salary | Needed for extraction, sent as is | Yes, which is why real cases use a self-hosted model |
| Support letter input | Only 11 facts; no passport number, date of birth or nationality | Minimal set |
| Audit log | Which model ran and how many values were redacted, never the values | Not applicable |

The model's prompt also tells it to treat document text as data and ignore instructions inside it.

## Demo vs. production

|  | Demo (now) | Production (real cases) |
| --- | --- | --- |
| Data | Synthetic samples only | Real client documents |
| Model | Claude via the Anthropic API | Open-weights model (for example Qwen 2.5) served with vLLM on a GPU server the firm controls |
| Where it runs | Anthropic's API | Private subnet in the firm's own cloud account |
| Privacy layers | MRZ parsing, redaction, audit log on | Same, unchanged |
| Switch | `LLM_PROVIDER=anthropic` | `LLM_PROVIDER=selfhosted` plus `LLM_SERVER_URL` |

The self-hosted provider is implemented and tested against a fake local server, but it is not deployed or used in the demo.

## Scripts

`npm test`, `npm run typecheck`, `npm run migrate`, `npm start`, `npm run dev:web`, `npm run build:web`.

## Out of scope

Filling the official I-129 PDF, OCR for scans, prevailing wage lookup, and multi-firm use. Filing with USCIS directly is not planned.
