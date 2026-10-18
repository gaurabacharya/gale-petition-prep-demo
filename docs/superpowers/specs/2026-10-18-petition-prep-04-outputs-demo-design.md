# Spec 04: Outputs and demo hardening (Day 2, afternoon)

## Purpose

This is flow step 5. Generate the two outputs once the attorney has approved everything, add the production-model stub and make the demo safe and clear.

**Done when:** outputs are blocked until all fields are approved, then generate.

## Scope

In: petition data sheet PDF, support letter draft, self-hosted provider stub, demo banner, README.
Out: filling the official I-129 PDF, OCR, prevailing wage lookup, multi-firm use.

## Output gate

Both outputs call one server-side check: every field in the case is `approved` and there are no unresolved `problem` checks (spec 03 shape). Otherwise the endpoint returns a clear error and the UI keeps the button disabled. Each generation is written to the audit log.

## Petition data sheet (PDF, pdf-lib)

- `POST /cases/:id/data-sheet` returns a PDF.
- Approved facts grouped by the I-129 and LCA sections they feed, with the beneficiary name and case label in the header.
- Built only from `fields` rows, with no model call.
- Open item: the exact section grouping is chosen while building and should be shown to the attorney for a quick check.

## Support letter draft

- `POST /cases/:id/letter` builds a specialty occupation argument.
- Input is limited to 11 facts, with no passport number, date of birth or nationality. The 11 facts are fixed in the letter `Schema` (expected: beneficiary name, degree, field of study, institution, date conferred, job title, duties, salary, start date, employer and worksite location, from approved fields; the design plan says 11, so confirm the list against it when building).
- Redaction from spec 01 still runs on the input.
- Any fact the documents don't provide appears as a `[BRACKET]` placeholder, and the prompt says so.
- Result is saved in `letters` with the model name. It is a draft for the attorney to edit.

## Self-hosted provider stub

- Add `selfhosted` to `LLM_PROVIDER`. It talks to an OpenAI-compatible chat endpoint (vLLM serves one) at `LLM_SERVER_URL`.
- Stub level: implements the `LlmClient` interface and is covered by a test against a fake local server. It is present in code but not exercised in the demo, and it is not deployed. The demo runs `LLM_PROVIDER=anthropic`.
- Switching providers needs no code change outside config.

## Demo safeguards

- **Banner**, shown on every screen: "Demo mode: synthetic data only. This build sends text to Claude via the Anthropic API. Real case files would use a self-hosted model."
- **Synthetic-only guard** from spec 02 is verified as part of this step.
- **README** covers: what it is, setup, env vars (`LLM_PROVIDER`, `LLM_SERVER_URL`, `DEMO_MODE`, key), how to run with the fixtures, the privacy layers, the demo vs. production table and the one-line split.

## Tests

- The gate rejects when one field is pending and passes when all are approved.
- The data sheet contains only approved values.
- The letter input contains none of the excluded fields, and unknown facts become brackets.
- The self-hosted provider passes the same `LlmClient` contract tests as the mock.

## Open items

- Letter wording and length are not set by the design plan. Pick a reasonable length and let the attorney edit.
