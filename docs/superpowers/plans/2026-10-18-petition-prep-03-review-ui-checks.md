# Petition Prep Review UI and Consistency Checks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the attorney see every fact beside its source, correct and approve it, and see where the documents disagree.

**Architecture:** A pure `runChecks` function over a case's fields produces typed check results. The Hono API exposes them at `GET /cases/:id/checks` and folds a discrepancy count into the case list. A React/Vite/Tailwind app in `web/` renders the review queue and the case review screen against the existing `PATCH /fields/:id`. Spec 04's output gate will reuse `runChecks` server-side.

**Tech Stack:** TypeScript, Hono, Postgres (PGlite in tests), React 18, react-router, Vite, Tailwind, lucide-react, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-10-18-petition-prep-03-review-ui-checks-design.md` (visual conventions: "UI: fit Gale's conventions" in `Petition Prep App Design Plan.md`).

## Global Constraints

- Work directly on `main`. **Do not run git commit, git push or git merge.** The user commits themselves.
- Checks are plain code: no model, no I/O. Level is exactly `problem`, `warning` or `for_attorney`.
- Check result shape: `{ id, level, message, fieldRefs }`. Discrepancy count = number of `problem` + `warning` checks.
- Discrepancy status pill is red, "Needs review" amber, default lavender. Primary button: near-black slate, about 6px corners. Table header: dark slate, white semibold labels. Page container about 1,300px. Serif page titles, Inter body. Own name "Petition Prep", no Gale logo.
- Editing a value sets `source = attorney` and resets `status = pending` (already implemented in `updateField`; do not change it).
- Case type, the two questionnaire columns and per-field questionnaire answers are seeded demo values and are labelled as such in the UI.
- Error bodies keep the `{ error: string }` shape. No auth, no real-time updates, no PDF or letter generation (spec 04).

## Review Focus

1. A document whose name field is empty (low confidence): no name-mismatch check fires for it, and low-confidence lists it. Pinned in Task 1.
2. Unparseable `start_date` or `expiry_date`: no crash. The validity check is skipped and the low-confidence or salary logic carries the signal. Pinned in Task 1.
3. Salary like `$95,000`, `95000`, `USD 95,000.00` parses. `negotiable` or empty does not, and gives the salary problem. Pinned in Task 1.
4. A case with no documents yet: `GET /cases/:id/checks` returns missing-document problems, not an error. Pinned in Task 2.
5. A re-upload resets approvals, and the UI must reflect that without a manual reload. Pinned in Task 5.

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/checks/parse.ts` | `parseDate`, `parseSalary`, `nameTokens`: free-text parsing helpers |
| `src/checks/checks.ts` | `Check` type, `runChecks`, `countDiscrepancies` |
| `src/seed/questionnaire.ts` | Seeded demo questionnaire answers per `docKind.name` |
| `migrations/002_case_seed.sql` | Adds `case_type`, `employer_questionnaire`, `beneficiary_questionnaire` to `cases` |
| `src/repo/cases.ts` (modify) | Summary gains discrepancy/problem counts and seeded columns; detail gains `answers` |
| `src/api/app.ts` (modify) | `GET /cases/:id/checks` |
| `src/server.ts` (modify) | Serve `web/dist` when it exists |
| `web/index.html`, `web/vite.config.ts`, `web/tsconfig.json` | UI toolchain |
| `web/src/main.tsx`, `App.tsx`, `index.css` | Entry, routes, Tailwind and fonts |
| `web/src/api.ts` | Typed fetch client |
| `web/src/lib/cn.ts`, `web/src/lib/sortFacts.ts` | Class merge; discrepancy-first fact ordering |
| `web/src/components/` | `Nav`, `Button`, `StatusPill`, `FactRow`, `ChecksCard` |
| `web/src/pages/ReviewQueue.tsx`, `CaseReview.tsx` | The two screens (ready-to-file is a state of `CaseReview`) |
| `test/checks/*.test.ts`, `test/web/*.test.tsx` | Unit and component tests |

---

### Task 1: Parsing helpers and checks

**Files:**
- Create: `src/checks/parse.ts`, `src/checks/checks.ts`
- Test: `test/checks/parse.test.ts`, `test/checks/checks.test.ts`

**Interfaces:**
- Consumes: `FieldRow`, `DocKind` from `src/repo/cases.ts` and `src/db/fields.ts`.
- Produces:
  - `parseDate(text: string): Date | undefined` (accepts ISO `2027-01-15` and `October 1, 2026`, UTC midnight)
  - `parseSalary(text: string): number | undefined` (annual dollars; undefined if no digits)
  - `nameTokens(name: string): string[]` (uppercased, whitespace-split, punctuation stripped)
  - `type CheckLevel = "problem" | "warning" | "for_attorney"`
  - `interface Check { id: string; level: CheckLevel; message: string; fieldRefs: { docKind: DocKind; name: string }[] }`
  - `runChecks(fields: readonly FieldRow[], documents: readonly { kind: DocKind }[]): Check[]`
  - `countDiscrepancies(checks: readonly Check[]): number`

Check ids: `missing_document_<kind>`, `name_mismatch_<kind>`, `passport_validity`, `mrz_check_digits`, `salary`, `low_confidence`, `specialty_occupation`, `prevailing_wage`.

- [ ] **Step 1: Write failing parse tests** in `test/checks/parse.test.ts`: `parseDate("October 1, 2026")` equals `2026-10-01`, `parseDate("2027-01-15")` equals `2027-01-15`, `parseDate("soon")` is undefined; `parseSalary("$95,000")` is 95000, `parseSalary("USD 95,000.00")` is 95000, `parseSalary("negotiable")` and `parseSalary("")` are undefined; `nameTokens("Anna  Maria O'Neil")` is `["ANNA","MARIA","ONEIL"]`.
- [ ] **Step 2: Run** `npx vitest run test/checks/parse.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** the three helpers in `src/checks/parse.ts`. Use `Date.parse` on a UTC-normalised string for month-name dates; no new dependency.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Write failing check tests** in `test/checks/checks.test.ts`. Build `FieldRow[]` from a small local helper `f(docKind, name, value, {confidence?, source?})` (defaults `high`, `llm`, `pending`). A `baseline()` set is the three documents with fixture values: passport `given_names "ANNA MARIA"`, `surname "ERIKSSON"`, `expiry_date "2027-01-15"`, `mrz_check_digits "ok"`; degree `name "Anna Eriksson"`; offer letter `name "Anna Eriksson"`, `annual_salary "$95,000"`, `start_date "October 1, 2026"`. Tests (each asserts `level` and `id`):
  - baseline gives `name_mismatch_degree` and `name_mismatch_offer_letter` as `warning` (missing middle name) and `passport_validity` as `warning` (expiry about 3.5 months after start).
  - degree name `"Anna Larsson"` gives `name_mismatch_degree` as `problem`.
  - passport expiry `2026-09-01` against start `October 1, 2026` gives `passport_validity` `problem`; expiry `2028-06-01` gives no validity check.
  - `mrz_check_digits` value `"failed: expiry_date"` gives `mrz_check_digits` `problem`; `"ok"` gives none.
  - offer `annual_salary` `"negotiable"` gives `salary` `problem`.
  - documents list missing `degree` gives `missing_document_degree` `problem`.
  - a field with `confidence: "low"` and `value: ""` gives one `low_confidence` `warning` whose `fieldRefs` include it; an empty degree `name` produces no `name_mismatch_degree` (Review Focus 1).
  - unparseable `start_date "TBD"` does not throw and produces no `passport_validity` (Review Focus 2).
  - baseline always includes `specialty_occupation` and `prevailing_wage` as `for_attorney`.
  - `countDiscrepancies` counts problems and warnings only.
- [ ] **Step 6: Run** `npx vitest run test/checks`. Expected: FAIL.
- [ ] **Step 7: Implement** `runChecks`. Name rule: passport tokens = `given_names` + `surname`; a document name equal as token sets passes; a document name whose tokens are a proper subset of the passport's and include the surname gives a warning; any other non-empty difference gives a problem. Validity rule: start from the offer letter `start_date`; expiry before start is a problem; expiry before start plus 6 months is a warning. Order results problems, then warnings, then `for_attorney`.
- [ ] **Step 8: Run** `npx vitest run test/checks && npm run typecheck`. Expected: PASS.

### Task 2: Seed data, repo and API

**Files:**
- Create: `migrations/002_case_seed.sql`, `src/seed/questionnaire.ts`
- Modify: `src/repo/cases.ts`, `src/api/app.ts`
- Test: `test/repo/cases.test.ts`, `test/api/app.test.ts`

**Interfaces:**
- Consumes: `runChecks`, `countDiscrepancies` (Task 1).
- Produces:
  - `GET /cases/:id/checks` returns `{ checks: Check[], discrepancies: number }`; 404 `{ error: "Not found" }` for a missing or malformed id.
  - `CaseSummary` gains `caseType: string`, `employerQuestionnaire: string`, `beneficiaryQuestionnaire: string`, `discrepancies: number`, `problems: number`; `status` becomes `"empty" | "discrepancy" | "needs_review" | "ready"` (`discrepancy` when `problems > 0`, checked before `needs_review`).
  - `CaseDetail` gains `answers: Record<string, string>` keyed `"<docKind>.<name>"`.
  - `getCaseChecks(db: Db, id: string): Promise<{ checks: Check[]; discrepancies: number } | undefined>` in `src/repo/cases.ts`.

- [ ] **Step 1: Write failing tests.** Repo: a new case has `caseType "lottery"`, `employerQuestionnaire "Approved"`, `beneficiaryQuestionnaire "Pending"` (seeded defaults); after saving the three baseline documents `listCases` shows `discrepancies` equal to the warning count and `status "needs_review"`; saving a failed MRZ passport gives `status "discrepancy"` and `problems >= 1`; `getCaseDetail` returns an `answers` object containing `"offer_letter.annual_salary"`. API: `GET /cases/:id/checks` on an empty case returns 200 with three `missing_document_*` problems (Review Focus 4); on a malformed id returns 404; after uploading the three fixtures via the existing `uploadDoc` helper it returns the middle-name warnings and `discrepancies` > 0.
- [ ] **Step 2: Run** `npx vitest run test/repo test/api`. Expected: FAIL.
- [ ] **Step 3: Implement** the migration (three `text not null` columns with the seeded defaults above), `src/seed/questionnaire.ts` exporting `SEEDED_ANSWERS: Record<string, string>` for the offer letter and degree keys (include `"offer_letter.name": "Anna Maria Eriksson"` so one row visibly differs from the document), then extend `listCases`, `getCaseDetail` and add `getCaseChecks`. Add the route in `makeApp` using `isUuid` and the existing `notFound` closure.
- [ ] **Step 4: Run** `npx vitest run && npm run typecheck`. Expected: PASS (existing tests unchanged apart from any `CaseSummary` shape assertions you must extend).

### Task 3: Frontend toolchain and app shell

**Files:**
- Create: `web/index.html`, `web/vite.config.ts`, `web/tsconfig.json`, `web/src/main.tsx`, `App.tsx`, `index.css`, `api.ts`, `lib/cn.ts`, `components/Nav.tsx`, `components/Button.tsx`, `components/StatusPill.tsx`
- Modify: `package.json`, `tsconfig.json`, `vitest.config.ts`, `src/server.ts`
- Test: `test/web/shell.test.tsx`

**Interfaces:**
- Produces:
  - `api.ts`: `listCases(): Promise<CaseSummary[]>`, `getCase(id): Promise<CaseDetail>`, `getChecks(id): Promise<{checks: Check[]; discrepancies: number}>`, `patchField(id, patch: {value?: string; status?: "pending"|"approved"}): Promise<FieldRow>`, `uploadDocument(caseId, kind, file: File): Promise<void>`. Types are imported from `src/` with `import type` so they stay in sync.
  - `<StatusPill status={CaseSummary["status"]} />`, `<Button variant="primary" | "secondary" />`.
  - Routes: `/` Cases, `/queue` Review queue, `/cases/:id` case review.

- [ ] **Step 1: Write failing test** `test/web/shell.test.tsx` (with `// @vitest-environment jsdom`): rendering `<App />` at `/` shows the nav brand "Petition Prep" and links "Cases" and "Review queue"; `StatusPill` renders "Needs review" for `needs_review` and "Discrepancy" for `discrepancy`, and has an amber/red class respectively.
- [ ] **Step 2: Run** `npx vitest run test/web`. Expected: FAIL (no react).
- [ ] **Step 3: Install and configure.** `npm i react react-dom react-router-dom lucide-react clsx tailwind-merge` and `npm i -D vite @vitejs/plugin-react tailwindcss @tailwindcss/vite @types/react @types/react-dom jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom`. Add scripts `dev:web` (`vite --config web/vite.config.ts`, dev proxy of `/cases` and `/fields` to `http://localhost:3000`) and `build:web`. Vitest `include` becomes `test/**/*.test.{ts,tsx}`; `web/tsconfig.json` sets `jsx: react-jsx` and the DOM lib; root `tsconfig.json` excludes `web` and `test/web`; the `typecheck` script runs both projects. In `src/server.ts`, when `web/dist` exists, serve it statically with `serveStatic` from `@hono/node-server/serve-static`, after API routes. The `tsconfig`, Tailwind and Inter/serif font setup are the only judgement calls here.
- [ ] **Step 4: Implement** the shell: Nav (own mark, bold "Petition Prep", muted grey links, user name placeholder), Button variants (slate primary with 6px radius; white secondary with thin grey border), StatusPill (lavender default for `ready`/`empty`, amber `needs_review`, red `discrepancy`), router, and a 1,300px centred container.
- [ ] **Step 5: Run** `npx vitest run && npm run typecheck && npm run build:web`. Expected: all PASS and a `web/dist` is produced.

### Task 4: Review queue screen

**Files:**
- Create: `web/src/pages/ReviewQueue.tsx`
- Modify: `web/src/App.tsx`
- Test: `test/web/queue.test.tsx`

**Interfaces:**
- Consumes: `listCases` (Task 3), `StatusPill`, `Button`.
- Produces: `<ReviewQueue filter="all" | "queue" />`. `/` uses `all` and `/queue` hides `ready` cases.

- [ ] **Step 1: Write failing tests** with `api.listCases` mocked: a row shows the beneficiary name with the employer below in grey; the columns are exactly Beneficiary, Case type, Case status, Employer questionnaire, Beneficiary questionnaire, Documents, Discrepancies, Actions; the action reads "Review case →" and links to `/cases/<id>`; with `filter="queue"` a `ready` case is not listed; a case with `discrepancies: 3` shows 3 and the red pill.
- [ ] **Step 2: Run** `npx vitest run test/web/queue.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the table in a bordered rounded card with a dark-slate header row, a serif "Attorney Review" title with a one-line grey subtitle, and a primary "+ New case" button on `/` that posts `POST /cases` with a prompted label then navigates to the case. Show a small "Demo data" note beside the seeded columns.
- [ ] **Step 4: Run** `npx vitest run test/web && npm run typecheck`. Expected: PASS.

### Task 5: Case review screen

**Files:**
- Create: `web/src/lib/sortFacts.ts`, `web/src/components/FactRow.tsx`, `web/src/components/ChecksCard.tsx`, `web/src/pages/CaseReview.tsx`
- Modify: `web/src/App.tsx`
- Test: `test/web/sortFacts.test.ts`, `test/web/review.test.tsx`

**Interfaces:**
- Consumes: `getCase`, `getChecks`, `patchField`, `uploadDocument` (Task 3), `Check`, `FieldRow`.
- Produces:
  - `sortFacts(fields: FieldRow[], checks: Check[]): FieldRow[]`: fields referenced by a `problem` or `warning` check come first (problems before warnings), original order otherwise.
  - `<FactRow field answer onSave onApprove discrepancyLevel />`.
  - `<ChecksCard checks />`, grouped Problems, Warnings, For attorney.

- [ ] **Step 1: Write failing tests.** `sortFacts`: a field referenced by a problem sorts before one referenced by a warning, which sorts before an unreferenced field. `review.test.tsx` with the `api` module mocked: (a) editing a value and saving calls `patchField(id, {value})` and the row then shows source "attorney" and status pending after refetch; (b) clicking "Accept" calls `patchField(id, {status: "approved"})`; (c) with every field approved the "Generate petition data" button is enabled and each row shows the approved circle-check, and with one pending it is disabled; (d) the checks card renders `Check.message` text from `getChecks`; (e) after an upload completes, `getCase` and `getChecks` are called again and previously approved rows show pending (Review Focus 5); (f) rows with a problem render with a red style class and appear first.
- [ ] **Step 2: Run** `npx vitest run test/web`. Expected: FAIL.
- [ ] **Step 3: Implement** `sortFacts`, `FactRow` (field name, questionnaire answer from `detail.answers["<docKind>.<name>"]` or an em dash, value with inline edit, source quote in grey, "Accept" button on the value side and on the answer side that sets the value to the answer then approves), `ChecksCard` and `CaseReview` (serif title with the beneficiary name and a `StatusPill`, two-column layout with the checks card on the right, per-document upload inputs, a single `refresh()` that refetches case and checks after every patch or upload, and the "Generate petition data" slate button disabled until all fields are approved and there are none; its click handler is a no-op placeholder with `title="Built in spec 04"`).
- [ ] **Step 4: Run** `npx vitest run && npm run typecheck`. Expected: PASS.

### Task 6: End-to-end verification

- [ ] **Step 1: Run** `npx vitest run && npm run typecheck && npm run build:web`. Expected: all PASS.
- [ ] **Step 2: Start** the API (`npm start`, demo mode on, `LLM_PROVIDER=mock` or Anthropic with the synthetic fixtures) and the UI (`npm run dev:web`). Upload the three fixture documents to a new case.
- [ ] **Step 3: Check in a browser:** the queue shows the case with a discrepancy count and amber/red pill; the case review shows the middle-name warning and expiry warning in the checks card; editing a value flips its source to attorney; approving everything unlocks "Generate petition data". Report anything that does not match.

## Self-Review

- **Spec coverage:** checks table (Task 1), `/checks` endpoint and discrepancy count (Task 2), queue columns and pills (Task 4), case review with inline edit, sort, checks card, ready state (Task 5), refetch after upload and change (Task 5), unit and component tests as listed (Tasks 1, 5), open items resolved as seeded data (Task 2).
- **Type consistency:** `Check`, `runChecks`, `countDiscrepancies` defined in Task 1 and used unchanged in 2 and 5; `CaseSummary.status` gains `discrepancy` in Task 2 and is used by `StatusPill` in Task 3.
- **Spec 04 hand-off:** `runChecks` is pure and server-callable, so the output gate re-runs it live rather than storing a resolved state.
