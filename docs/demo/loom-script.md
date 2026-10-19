# Loom script (about 2.5 minutes)

## Before recording

- [ ] `.env` has `DEMO_MODE=true` and `DATABASE_URL=pglite:./.pglite`.
  - For a live take: `LLM_PROVIDER=anthropic` and a real `ANTHROPIC_API_KEY`. Keep the key off screen.
  - For a safe take with no API calls: `LLM_PROVIDER=replay`. The banner then says the model answers are recorded.
- [ ] `npm run demo:reset -- --yes` (empties the demo database), then `npm run build:web && npm start`.
- [ ] Open `http://localhost:3000`. The demo banner is visible on every screen.
- [ ] Browser window about 1440 px wide, so the letter text box and its PDF preview sit side by side.
- [ ] Do one dry run first. Reset again before the take.

## Take

| Time | Show | Say |
| --- | --- | --- |
| 0:00 | Cases tab | "This is Petition Prep, a tool for an immigration attorney or paralegal preparing an H-1B petition. It turns a passport, a degree and an offer letter into approved petition data and a draft support letter." |
| 0:10 | Click "+ New case", name it "Doe H-1B", press "Create case" | "Each petition is a case." |
| 0:15 | In the "Add documents" pop-up, press "Fill example", then drag in the passport scan. Let the steps tick through. | "The passport is a scanned image. It's read with OCR on this server, and its machine-readable zone is parsed and check-digit validated locally. The passport never goes to a model." |
| 0:30 | Drag in the degree PDF, then the offer letter PDF | "The degree and offer letter have IDs, emails and phone numbers swapped for tokens before Claude sees them. Every value has to come with a quote from the document, and the quote is checked against the text." |
| 0:45 | Press "Review facts". Point at the Checks card. | "These checks are plain code, not the model. They caught a missing middle name on both the degree and the offer letter, and a passport that expires within six months of the start date." |
| 1:00 | On the degree "name" row, press Accept beside the questionnaire answer "John Michael Doe" | "Each fact shows the questionnaire answer next to what the document says. I'll take the full name from the questionnaire. The row stays where it is and shows which side I accepted, and the warning clears." |
| 1:10 | On the offer letter "name" row, press Edit, type "John Michael Doe", press Enter | "If something was parsed wrong, I can just edit it. Save and accept approves it, and it's marked as attorney-entered, so you can always tell a person changed it." |
| 1:20 | Accept the remaining rows, top to bottom. Point at "Not ready yet: … facts to accept" in the header as it counts down. | "The model drafts, and the attorney approves every single fact. Nothing leaves the app until that's done. The passport expiry warning stays visible after I accept it, marked as reviewed." |
| 1:35 | "Ready to file" appears above the table. Point at the Petition data preview. | "Once every fact is approved and no problem is left, the outputs unlock. The petition data sheet is built only from approved facts, grouped by the I-129 and LCA sections they feed. No model is involved." |
| 1:45 | Press "Draft support letter" | "The support letter gets only the eleven facts it needs. No passport number, birth date or nationality. Anything the documents don't say comes back as a bracket for the attorney to fill." |
| 1:55 | In the text box, replace "[DATE]" with today's date. Wait a second for the PDF preview to update. | "The attorney edits the text here, and the PDF preview on the right updates as they type. The edit is saved with the case." |
| 2:05 | Press "Download PDF" on the letter, then on the petition data | "Both come out as PDFs, ready to attach." |
| 2:10 | README, demo vs. production table | "For this demo I'm using Claude with fake data. In a real workflow, client documents would go to a model running on the firm's own servers, and the code is already built so that's a config switch." |
| 2:25 | Repo link | "Code and specs are in the repo. Thanks for watching." |

## Cut if short on time

- Skip the questionnaire Accept at 1:00 and only show the edit at 1:10. The edit alone clears the offer letter warning.
- Skip the downloads at 2:05. The previews already show both outputs.

Do not add features: anything unfinished is cut from the take.

## If something goes wrong on camera

- **A document is refused in replay mode:** only the John Doe samples have recorded answers. Use the "Fill example" files.
- **"Ready to file" doesn't appear:** read the "Not ready yet" note in the header. It names the facts left to accept or the problem left to fix.
