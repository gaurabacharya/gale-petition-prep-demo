# Loom script (about 2 minutes)

## Before recording

- [ ] `.env` has `DEMO_MODE=true`, `LLM_PROVIDER=anthropic` and a real `ANTHROPIC_API_KEY`. Keep the key off screen.
- [ ] `npm run demo:reset -- --yes` (empties the demo database), then `npm run build:web && npm start`.
- [ ] Open `http://localhost:3000`. The demo banner is visible on every screen.
- [ ] `samples/` is open in a Finder window so the three files are ready to pick: `passport.txt`, `degree.txt`, `offer-letter.txt`.
- [ ] Do one dry run first. Reset again before the take.

## Take

| Time | Show | Say |
| --- | --- | --- |
| 0:00 | Review queue (Cases tab) | "This is Petition Prep, a tool for an immigration attorney or paralegal preparing an H-1B petition." |
| 0:15 | Click "Fill in demo info" (creates the John Doe case and uploads the three samples) | "The passport is parsed locally from its machine-readable zone and never goes to a model. The degree and offer letter have IDs redacted, then go to Claude. Everything here is synthetic." |
| 0:40 | Case review, checks card | "These checks are plain code, not the model. They caught the missing middle name and a passport that expires within six months of the start date." |
| 1:05 | Edit one value, then Accept the rest | "The model drafts, and the attorney approves every fact. An edit marks it as attorney-sourced and sends it back to pending." |
| 1:25 | Generate petition data, then Draft support letter | "Outputs stay locked until every fact is approved. The data sheet is built from the approved facts only, and the letter draft leaves brackets for anything the documents don't say." |
| 1:40 | README, demo vs. production table | "For this demo I'm using Claude with fake data. In a real workflow, client documents would go to a local model running on our own servers, and the code is already built so that's a config switch." |
| 1:55 | Repo link | "Code and specs are in the repo. Thanks for watching." |

## Cut if short on time

Skip the inline edit at 1:05 and the letter draft at 1:25. Do not add features: anything unfinished is cut from the take.
