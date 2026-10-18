# Petition Prep: Spec Index

Source: `Petition Prep App Design Plan.md`. Each spec below covers one row of its Build plan and is small enough for one writing-plans cycle.

## Build order

| # | Spec | When | Depends on |
| --- | --- | --- | --- |
| 01 | [Foundations](2026-10-18-petition-prep-01-foundations-design.md) | Day 1 AM | none |
| 02 | [Extraction pipeline and API](2026-10-18-petition-prep-02-extraction-api-design.md) | Day 1 PM | 01 |
| 03 | [Review UI and checks](2026-10-18-petition-prep-03-review-ui-checks-design.md) | Day 2 AM | 02 |
| 04 | [Outputs and demo hardening](2026-10-18-petition-prep-04-outputs-demo-design.md) | Day 2 PM | 03 |
| 05 | [Loom and handoff](2026-10-18-petition-prep-05-loom-handoff-design.md) | Final hour | 04 |

## Demo configuration

The demo runs on the Claude API (`LLM_PROVIDER=anthropic`) with synthetic sample data only. Mock is for tests. Self-hosted is the production path: it exists in code as a stub, but the demo does not run it.

## User flow to spec mapping

| Flow step | Spec |
| --- | --- |
| 1. Upload (passport, degree, offer letter) | 02 |
| 2a. Passport parsed locally from the MRZ, never sent to a model | 01 (parser), 02 (route) |
| 2b. Degree and offer letter: IDs redacted, model extracts with quotes, values restored | 01 (redaction, `LlmClient`), 02 (pipeline) |
| 3. Consistency checks | 03 |
| 4. Attorney review, outputs locked until done | 03 (UI), 04 (gate) |
| 5. Outputs: data sheet PDF, support letter draft | 04 |

## Architecture to spec mapping

| Component | Spec |
| --- | --- |
| React review UI | 03 |
| Hono API (typed errors mapped to HTTP codes) | 02 |
| Privacy layer (MRZ parser, redaction, token vault) | 01 |
| Pipeline (redact, call model, validate, restore) | 02 |
| Checks and outputs | 03 (checks), 04 (outputs) |
| Postgres (cases, fields, review status, audit log with counts only) | 01 |
| `LlmClient` (Anthropic, Mock, Self-hosted) | 01 (Anthropic, Mock), 04 (Self-hosted stub) |

## Shared decisions (from the design plan)

- **Stack:** TypeScript throughout. React + Vite, Hono on Node, Effect TS (`Schema` validates model output), Postgres, pdf-lib. UI: Tailwind, shadcn/ui, lucide-react, Inter.
- **Stance:** the model drafts and extracts, deterministic code checks, an attorney approves every fact before any output exists.
- **Privacy:** the passport never reaches a model (local MRZ parse). Sensitive identifiers in other documents are tokenised before any model call. The audit log stores counts, never values.
- **Demo vs. production:** the demo uses Claude on synthetic data only. Production switches to a self-hosted model via `LLM_PROVIDER`.
- **Synthetic data:** specimen passport (country code `UTO`), fictional employer, a missing middle name on one document, and a passport expiring near the start date.

## Glossary

- **Fact / field:** one row in `fields`, the single source for every output.
- **High confidence:** the quote the model returned appears verbatim in the document.
- **MRZ:** machine-readable zone on the passport, validated with ICAO check digits.
- **Token:** a placeholder such as `[[SSN_1]]` swapped in before a model call and restored after.

## Cross-spec contracts

- The `fields` columns are defined in spec 01 and are used unchanged by 02, 03 and 04.
- `LlmClient` is defined in 01. Spec 02 consumes it, and spec 04 adds a third provider (self-hosted stub).
- The check results shape is defined in 03 and is read by 04 for the output gate.
