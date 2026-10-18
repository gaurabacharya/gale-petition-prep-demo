# Petition Prep Outputs and Demo Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate the petition data sheet PDF and the support letter draft once an attorney has approved everything, add the self-hosted model provider, and make the demo safe and documented.

**Architecture:** One server-side gate (`checkOutputGate`) decides whether outputs may be generated; it re-runs spec 03's `runChecks` live, so a corrected field clears its problem. The data sheet is built with pdf-lib from approved `fields` rows only. The letter goes through the existing `LlmClient` with an 11-fact input, redaction, and bracket placeholders. The self-hosted provider is a second `LlmProvider` behind the same interface, chosen by `LLM_PROVIDER`.

**Tech Stack:** TypeScript, Hono, Effect TS (`Schema`), pdf-lib, Postgres (PGlite in tests), React (existing `web/`), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-18-petition-prep-04-outputs-demo-design.md` (letter facts and demo wording also come from `Petition Prep App Design Plan.md`).

## Global Constraints

- Work directly on `main`. **Do not run git commit, git push or git merge** unless the user asks in that moment; the user commits themselves.
- Both outputs are blocked unless every field is `approved` and `runChecks` returns no `problem`. The blocked response is HTTP 409 with `{ error: string }`.
- The data sheet is built only from `fields` rows: no model call, and no `mrz_check_digits` row (internal, not a fact).
- The letter input is exactly these 11 facts and nothing else: beneficiary name, degree, field of study, institution, date conferred, job title, duties, salary, start date, employer, worksite location. No passport number, date of birth or nationality.
- Anything the documents don't provide appears as a `[BRACKET]` placeholder, and the prompt says so.
- The audit log records generation with counts only, never values.
- Banner text, verbatim, on every screen: "Demo mode: synthetic data only. This build sends text to Claude via the Anthropic API. Real case files would use a self-hosted model."
- `LLM_PROVIDER` accepts `anthropic`, `mock` and `selfhosted`. `selfhosted` needs `LLM_SERVER_URL`. Switching providers needs no code change outside config.
- The demo runs `LLM_PROVIDER=anthropic`. The self-hosted provider is present and tested, not deployed.
- Out of scope: filling the official I-129 PDF, OCR, prevailing wage lookup, multi-firm use.

## Review Focus

1. Names with characters pdf-lib's standard font cannot encode (`Nováková`, `Søren`, CJK): the data sheet still generates, with unencodable characters replaced by `?`, and never returns a 500. Pinned in Task 2.
2. Long `duties` text: wraps and flows onto a second page instead of running off the sheet. Pinned in Task 2.
3. An attorney edits an approved field after approval: its status resets to pending, so the next generate request is blocked. Pinned in Task 1.
4. The model returns an empty or whitespace-only letter body: the request fails with 502 and no `letters` row is written. Pinned in Task 3.
5. Regenerating the letter replaces the saved draft instead of failing on the primary key. Pinned in Task 3.

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/outputs/gate.ts` | `checkOutputGate`: approved-and-no-problems decision with reasons |
| `src/outputs/dataSheet.ts` | `SHEET_SECTIONS` mapping and `buildDataSheet` (pdf-lib) |
| `src/outputs/letter.ts` | `LETTER_FACTS`, `buildLetterFacts`, `buildLetterPrompt`, `generateLetter` |
| `src/errors.ts` (modify) | `OutputsBlockedError` |
| `src/repo/cases.ts` (modify) | `saveLetter` |
| `src/llm/selfhosted.ts` | `makeSelfHostedProvider` (OpenAI-compatible chat endpoint) |
| `src/llm/config.ts` (modify) | `selfhosted` branch, `LLM_SERVER_URL`, optional `LLM_MODEL` |
| `src/api/app.ts` (modify) | `POST /cases/:id/data-sheet`, `POST /cases/:id/letter` |
| `web/src/api.ts`, `web/src/pages/CaseReview.tsx`, `web/src/components/LetterPanel.tsx` | Generate buttons, PDF download, editable letter draft |
| `README.md`, `.env.example` | Setup, env vars, privacy layers, demo vs production |
| `test/outputs/*.test.ts`, `test/llm/selfhosted.test.ts`, `test/web/outputs.test.tsx` | Tests |

---

### Task 1: Output gate

**Files:**
- Create: `src/outputs/gate.ts`
- Modify: `src/errors.ts`, `src/api/app.ts` (error mapping only)
- Test: `test/outputs/gate.test.ts`

**Interfaces:**
- Consumes: `getCaseDetail` (`src/repo/cases.ts`), `runChecks` (`src/checks/checks.ts`).
- Produces:
  - `class OutputsBlockedError extends Data.TaggedError("OutputsBlockedError")<{ message: string; pending: number; problems: readonly string[] }>`
  - `checkOutputGate(db: Db, caseId: string): Promise<{ detail: CaseDetail } | { blocked: OutputsBlockedError } | undefined>` (`undefined` when the case does not exist).
  - API mapping: `OutputsBlockedError` becomes HTTP 409 `{ error: message }`.

- [ ] **Step 1: Write failing tests** in `test/outputs/gate.test.ts` using `makeTestDb`, `createCase`, `saveExtraction` and the three fixture field sets (reuse the `baseline` shape from `test/checks/checks.test.ts` as `FieldInput[]` saved via `saveExtraction`):
  - one pending field gives `blocked` with `pending: 1` and a message containing "1 field".
  - every field approved and no problem checks gives `{ detail }`.
  - every field approved but an unusable salary (`"negotiable"`) gives `blocked` with `problems` containing `"salary"`.
  - a case with no fields gives `blocked` (nothing to generate).
  - Review Focus 3: approve all, then `updateField(db, id, { value: "Senior Engineer" })` on one field, and the gate is blocked again with `pending: 1`.
  - an unknown or malformed case id gives `undefined`.
- [ ] **Step 2: Run** `npx vitest run test/outputs/gate.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `OutputsBlockedError` and `checkOutputGate`. Load `getCaseDetail`, count pending fields, run `runChecks(detail.fields, detail.documents)`, collect ids of `problem` checks. The message names the pending count and the problem ids in plain words.
- [ ] **Step 4: Run** the same command. Expected: PASS. Then `npm run typecheck`.

### Task 2: Petition data sheet

**Files:**
- Create: `src/outputs/dataSheet.ts`
- Modify: `src/api/app.ts`
- Test: `test/outputs/dataSheet.test.ts`, extend `test/api/app.test.ts`

**Interfaces:**
- Consumes: `checkOutputGate` (Task 1), `FieldRow`, `AuditLog`.
- Produces:
  - `SHEET_SECTIONS: readonly { title: string; fields: readonly { docKind: DocKind; name: string; label: string }[] }[]`
  - `buildDataSheet(input: { caseLabel: string; beneficiary: string; fields: readonly FieldRow[] }): Promise<Uint8Array>`
  - `POST /cases/:id/data-sheet`: 200 `application/pdf` with `content-disposition: attachment; filename="petition-data-<label>.pdf"` (label sanitised to `[A-Za-z0-9-_]`), 404 unknown case, 409 blocked. Writes audit `output_generated` with `counts: { data_sheet: 1 }`.

Section grouping (chosen here, shown to the attorney for a quick check; the same fact may appear in more than one section):

| Section | Facts |
| --- | --- |
| I-129 Part 1: Petitioner | `offer_letter.employer` |
| I-129 Part 3: Beneficiary | passport `surname`, `given_names`, `date_of_birth`, `sex`, `nationality`, `issuing_country`, `passport_number`, `expiry_date` |
| I-129 Part 5 and LCA: Employment | offer letter `job_title`, `duties`, `annual_salary`, `start_date`, `worksite_location`, `employer` |
| I-129 H Supplement: Education | degree `name`, `degree`, `field_of_study`, `institution`, `date_conferred` |

- [ ] **Step 1: Write failing tests.** `dataSheet.test.ts` extracts text from the returned bytes with `pdfToText` (`src/api/pdf.ts`) and asserts: the header contains the beneficiary name and case label; every approved value appears under its section title; a pending field's value never appears (only approved rows are passed in, so also assert a `pending` row handed to `buildDataSheet` is omitted); no `mrz_check_digits` text appears; the output begins with `%PDF`. Review Focus 1: a `surname` of `"Nováková"` and a `given_names` of `"Søren 李"` generate without throwing and the text contains `Nov` and `?` in place of the unencodable characters. Review Focus 2: `duties` of 3,000 characters yields a PDF with more than one page (`PDFDocument.load(bytes).getPageCount() > 1`) and the full text still extracted. API tests: all fields approved gives 200 with `content-type` `application/pdf` and an `output_generated` audit entry with `counts: { data_sheet: 1 }` and no values; one pending gives 409 and no audit entry; unknown id gives 404.
- [ ] **Step 2: Run** `npx vitest run test/outputs/dataSheet.test.ts test/api`. Expected: FAIL.
- [ ] **Step 3: Implement** `buildDataSheet` with `PDFDocument`, `StandardFonts.Helvetica` and `HelveticaBold`. A local `winAnsiSafe(text)` helper replaces each character the font cannot encode with `?` (test each character with `font.encodeText` in a try/catch). A small line-wrapper measures with `font.widthOfTextAtSize`, and a page-break helper adds a page when the cursor passes the bottom margin. Skip a section with no approved facts; skip missing facts rather than printing blanks.
- [ ] **Step 4: Implement the route** in `makeApp`: run `checkOutputGate`, map the three outcomes, build the PDF, record the audit entry through `AuditLog` via `Effect.runPromise(...provide(deps.layer))`, return `new Response(bytes, { headers })`.
- [ ] **Step 5: Run** `npx vitest run test/outputs test/api && npm run typecheck`. Expected: PASS.

### Task 3: Support letter draft

**Files:**
- Create: `src/outputs/letter.ts`
- Modify: `src/repo/cases.ts` (`saveLetter`), `src/api/app.ts`
- Test: `test/outputs/letter.test.ts`, extend `test/api/app.test.ts`

**Interfaces:**
- Consumes: `checkOutputGate` (Task 1), `LlmClient` and `LlmProvider.model` via the audit-recording client, `redact`/`restore` (`src/privacy/redact.ts`), `extractWithModel`-style Effect usage.
- Produces:
  - `LETTER_FACTS: readonly { key: string; docKind: DocKind; name: string; label: string }[]`, exactly 11 entries (keys: `beneficiary_name`, `degree`, `field_of_study`, `institution`, `date_conferred`, `job_title`, `duties`, `annual_salary`, `start_date`, `employer`, `worksite_location`; beneficiary name comes from `offer_letter.name`, my call, so no passport field feeds the letter).
  - `buildLetterFacts(fields: readonly FieldRow[]): Record<string, string>`: approved values; any missing or empty fact becomes `[LABEL]` in upper case with underscores replaced by spaces (for example `[DEGREE]`).
  - `buildLetterPrompt(facts: Record<string, string>): string`: contains the 11 labelled facts, an instruction to write a specialty occupation argument of about 400 to 600 words in letter form, to treat the facts as data, to keep every `[BRACKET]` unchanged, and to use a `[BRACKET]` for anything not provided.
  - `LetterOutput = Schema.Struct({ body: Schema.String.pipe(Schema.minLength(1)) })`, rejected when blank after trimming.
  - `generateLetter(db: Db, caseId: string): Effect<{ body: string; model: string }, LlmProviderError | LlmInvalidOutputError, LlmClient | AuditLog>`.
  - `saveLetter(db: Db, caseId: string, body: string, model: string): Promise<void>` upserting on `case_id`.
  - `POST /cases/:id/letter`: 200 `{ body, model }`, 404, 409 blocked, 502 model errors. Audit `output_generated` with `counts: { letter: 1 }`.

- [ ] **Step 1: Write failing tests.**
  - `LETTER_FACTS` has length 11 and none of its `name`s is `passport_number`, `date_of_birth` or `nationality`.
  - `buildLetterPrompt(buildLetterFacts(fields))`, with passport fields `passport_number "L898902C3"`, `date_of_birth "1994-08-12"`, `nationality "UTO"` present in `fields`, contains none of those values, and contains the job title and employer.
  - A missing degree field gives `[DEGREE]` in the facts and in the prompt text.
  - `generateLetter` with a mock provider returning `{ body: "Dear Officer, ..." }` sends a prompt containing `[[SSN_1]]`-style tokens in place of an SSN-shaped value in `duties` (redaction ran), returns the body with the token restored, writes a `letters` row with the model name, and the audit entries contain `llm_call` with redaction counts and no values.
  - Review Focus 4: a mock returning `{ body: "   " }` yields `LlmInvalidOutputError` and no `letters` row.
  - Review Focus 5: calling twice leaves one `letters` row holding the second body.
  - API: approved case returns 200 `{ body, model }`; one pending field returns 409 and the mock is never called.
- [ ] **Step 2: Run** `npx vitest run test/outputs/letter.test.ts test/api`. Expected: FAIL.
- [ ] **Step 3: Implement** the module and `saveLetter`. Follow `extractWithModel` in `src/pipeline/model.ts` for the redact, `llm.complete({ prompt, schema, redactions })`, restore sequence. The model name for the `letters` row and response comes from a new optional `model` the server reads from the provider at startup: extend `AppDeps` with `modelName: string` (set in `src/server.ts` from `provider.name`/`provider.model`; tests pass `"mock"`).
- [ ] **Step 4: Run** `npx vitest run test/outputs test/api && npm run typecheck`. Expected: PASS.

### Task 4: Self-hosted provider

**Files:**
- Create: `src/llm/selfhosted.ts`
- Modify: `src/llm/config.ts`, `src/server.ts`, `.env.example`, `test/llm/config.test.ts`, `test/llm/llmClient.test.ts`
- Test: `test/llm/selfhosted.test.ts`

**Interfaces:**
- Consumes: `LlmProvider`, `LlmProviderError` (`src/llm/LlmClient.ts`).
- Produces:
  - `makeSelfHostedProvider(opts: { url: string; model?: string; fetch?: typeof fetch }): LlmProvider` with `name "selfhosted"`; POSTs `${url}/v1/chat/completions` with `{ model, messages: [system, user], temperature: 0 }` and returns `choices[0].message.content`.
  - `llmProviderFromEnv` gains `selfhosted`: requires `LLM_SERVER_URL` (config error naming it when missing), optional `LLM_MODEL` (my call; default `"Qwen/Qwen2.5-72B-Instruct"`), and the unknown-provider message becomes `Expected anthropic, selfhosted or mock.`

- [ ] **Step 1: Write failing tests.** `selfhosted.test.ts` starts a fake local server with `node:http` on an ephemeral port: it returns `{"choices":[{"message":{"content":"{\"a\":1}"}}]}`; the provider returns `{"a":1}` and the fake saw the system and user messages and the model; a 500 response, a malformed body and an empty `content` each give `LlmProviderError` whose message contains neither the response body nor the URL. Extend `llmClient.test.ts` so its existing contract cases (valid output, fenced JSON, invalid output, audit row with provider and model) run for both the mock provider and a self-hosted provider pointed at a fake server (use `describe.each`). Update `config.test.ts`: `selfhosted` without `LLM_SERVER_URL` is an `LlmConfigError` naming `LLM_SERVER_URL`; with it, the provider name is `selfhosted`; replace the old "rejects selfhosted until spec 04" case with an unknown-provider case.
- [ ] **Step 2: Run** `npx vitest run test/llm`. Expected: FAIL.
- [ ] **Step 3: Implement** the provider (use the injected `fetch`, default global) and the config branch. Add `LLM_SERVER_URL` and `LLM_MODEL` to `.env.example`. Print the provider name at startup (already done in `src/server.ts`).
- [ ] **Step 4: Run** `npx vitest run test/llm && npm run typecheck`. Expected: PASS.

### Task 5: Review screen outputs

**Files:**
- Create: `web/src/components/LetterPanel.tsx`
- Modify: `web/src/api.ts`, `web/src/pages/CaseReview.tsx`
- Test: `test/web/outputs.test.tsx`

**Interfaces:**
- Consumes: `POST /cases/:id/data-sheet`, `POST /cases/:id/letter` (Tasks 2 and 3).
- Produces:
  - `api.generateDataSheet(caseId): Promise<Blob>`, `api.generateLetter(caseId): Promise<{ body: string; model: string }>`; both throw `Error(message)` from the `{ error }` body on 409/502.
  - "Generate petition data" now downloads the PDF; a second button "Draft support letter" fills `<LetterPanel />` with an editable textarea and a "Copy" button.

- [ ] **Step 1: Write failing tests** (happy-dom, `api` mocked): with every field approved, clicking "Generate petition data" calls `generateDataSheet` once and triggers a download (mock `URL.createObjectURL` and assert an anchor click); with one pending field both buttons are disabled; clicking "Draft support letter" shows the returned body in a textbox the user can edit; a rejected `generateLetter` shows its error message; the demo banner text appears on the case review and queue screens, verbatim.
- [ ] **Step 2: Run** `npx vitest run test/web`. Expected: FAIL.
- [ ] **Step 3: Implement** the client functions and UI. Both buttons are disabled unless every field is approved (the server gate is still authoritative and its 409 message is shown). The letter text lives in component state only, as it is already saved server-side.
- [ ] **Step 4: Run** `npx vitest run test/web && npm run typecheck && npm run build:web`. Expected: PASS.

### Task 6: README, demo guard check and end-to-end verification

**Files:**
- Modify: `README.md` (currently empty)
- Test: extend `test/api/app.test.ts`

- [ ] **Step 1: Verify the synthetic-only guard.** The existing tests cover the 403 for a non-UTO passport; add one API test that the rejection writes an `upload_rejected` audit entry with empty detail and that nothing is stored (the case has no documents afterwards).
- [ ] **Step 2: Run** that test. Expected: PASS (if it fails, the guard has a gap: fix it in `src/pipeline/passport.ts` or `src/pipeline/extract.ts`).
- [ ] **Step 3: Write `README.md`** covering what it is, setup (`npm install`, `DATABASE_URL`, `npm run migrate`, `npm run build:web`, `npm start`), the env vars table (`LLM_PROVIDER`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `LLM_SERVER_URL`, `LLM_MODEL`, `DEMO_MODE`, `DATABASE_URL`, `PORT`), running with the fixtures in `test/fixtures`, the privacy layers table from the design plan, the demo versus production table, and the line: "For this demo I'm using Claude with fake data. In a real workflow, client documents would go to a local model running on our own servers, and the code is already built so that's a config switch."
- [ ] **Step 4: Run** `npx vitest run && npm run typecheck && npm run build:web`. Expected: all PASS.
- [ ] **Step 5: Manual check.** Start the app with the mock provider and the three fixtures as in the spec 03 smoke test: confirm both buttons stay disabled until every field is approved, the PDF downloads and shows the four sections, the letter draft appears with `[BRACKET]`s for unknown facts, and the banner shows on both screens. Show the section grouping to the user for the quick check the spec asks for.

## Self-Review

- **Spec coverage:** gate (Task 1), data sheet with sections and approved-only content (Task 2), letter with 11 facts, redaction, brackets, `letters` row and model name (Task 3), self-hosted stub with fake-server test and contract tests (Task 4), UI buttons, disabled state and banner (Task 5), guard verification and README (Task 6). The audit entry for each generation is in Tasks 2 and 3.
- **Type consistency:** `OutputsBlockedError` and `checkOutputGate` are defined in Task 1 and used unchanged in 2 and 3; `LETTER_FACTS` has 11 entries in Task 3 and the test asserts it. The new `AppDeps.modelName` is added in Task 3 and `makeApp` callers (tests, `src/server.ts`) must pass it.
- **Spec open items:** section grouping is shown to the user in Task 6; letter length is set at about 400 to 600 words and left for the attorney to edit.
- **Known tension:** a problem check the attorney considers a false positive blocks outputs until the underlying field is corrected, because the spec says "no unresolved problem checks" and there is no dismiss action.
