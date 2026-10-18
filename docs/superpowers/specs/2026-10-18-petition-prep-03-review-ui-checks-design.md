# Spec 03: Review UI and consistency checks (Day 2, morning)

## Purpose

Let the attorney see every fact beside its source, correct it, approve it, and see where the documents disagree.

**Done when:** the attorney can correct and approve each field, and the checks show beside it.

## Scope

In: consistency checks (plain code), React/Vite screens, check results endpoint.
Out: PDF and letter generation (spec 04), authentication, real-time updates.

## Consistency checks (flow step 3)

They run on the extracted fields before attorney review (step 4). Pure functions over a case's fields, with no model and no I/O. Each returns `{ id, level, message, fieldRefs }` where level is `problem`, `warning` or `for_attorney`.

| Check | Level | Rule |
| --- | --- | --- |
| Missing document | problem | each of the 3 documents is uploaded |
| Name mismatch | problem, or warning | degree and offer letter names match the passport name. A shorter name (missing middle name) is a warning, and any other difference is a problem. |
| Passport validity | problem, or warning | expires before the start date is a problem. Within 6 months of it is a warning. |
| MRZ check digits | problem | any ICAO digit failed |
| Salary | problem | the offer letter has a usable annual salary |
| Low confidence | warning | lists fields that are missing or whose quote wasn't found |
| Specialty occupation | for_attorney | confirm the degree field relates to the role |
| Prevailing wage | for_attorney | compare salary to the wage level for job code and area, manual in the demo |

`GET /cases/:id/checks` runs them and returns the list. A discrepancy count is the number of problems and warnings.

## Screens (flow step 4: attorney review)

Outputs stay locked until every fact is reviewed.

Style follows the "UI: fit Gale's conventions" table in the design plan (Tailwind, shadcn/ui, lucide-react, Inter body, serif page titles, slate primary button, dark-header table). Own name and mark, no Gale logo.

1. **Review queue.** Columns: beneficiary (name, employer below), case type, case status pill, employer questionnaire, beneficiary questionnaire, documents, discrepancies, "Review case →". Status pills: lavender default, amber "Needs review", red "Discrepancy".
2. **Case review.** Serif title with the beneficiary name and a status pill. Each fact row shows the field name, the value, its source quote and an "Accept" button. Rows are editable inline, and an edit sets the source to attorney. Discrepancy rows sort to the top in red. The checks sit in a card on the right.
3. **Ready to file.** When every field is approved, all rows show the circle-check and the "Generate petition data" button unlocks (its action is built in spec 04).

Top nav links: Cases, Review queue.

## Behaviour

- Approving sets `status = approved` through `PATCH /fields/:id`. Editing a value also resets that field to pending until accepted again.
- A re-upload sends the case back to review, so the UI re-fetches after any upload.
- Checks refresh after each change.

## Tests

- Unit tests for each check, using the fixtures: the missing middle name gives a name warning, the near-expiry passport gives a validity warning, and a failed digit gives a problem.
- Component tests: editing marks the source as attorney, approve-all unlocks the button, and discrepancies sort first.

## Open items

- "Case type" and the two questionnaire columns have no source data in the extraction design. The demo shows seeded values. If that is wrong, say so before building.
- A field's questionnaire answer, shown next to the document value, also needs seed data.
