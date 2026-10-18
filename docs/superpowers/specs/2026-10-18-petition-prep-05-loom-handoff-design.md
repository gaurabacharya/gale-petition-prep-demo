# Spec 05: Loom and handoff (final hour)

## Purpose

Package the demo for the founders: a 2-minute recording, a clean public repo and the intro message.

**Done when:** the Loom is recorded, the repo is pushed and the intro is sent.

## Scope

In: demo run-through, Loom script, repo checklist, intro message.
Out: new features. Anything unfinished is cut from the demo, not added.

## Pre-recording checklist

- App runs from a clean checkout with the README steps and the fixtures.
- `DEMO_MODE=true` and `LLM_PROVIDER=anthropic`. No real data anywhere.
- Banner visible. Database reset to a known state.
- No secrets or `.env` files committed.

## Loom script (about 2 minutes)

| Time | Show | Say |
| --- | --- | --- |
| 0:00 | Review queue | What it is and who it's for: an attorney preparing an H-1B petition |
| 0:15 | Upload the 3 sample documents | The passport is parsed locally and never sent to a model. The other documents are redacted and sent to Claude, with synthetic data only |
| 0:40 | Case review: checks card | The checks catch the missing middle name and the near-expiry passport, in plain code, not the model |
| 1:05 | Correct and approve a field | The model drafts, and the attorney approves every fact |
| 1:25 | Generate data sheet and letter | Outputs only unlock after full approval |
| 1:40 | README demo vs. production table | Self-hosted is described as the production switch only, not shown running. "For this demo I'm using Claude with fake data. In a real workflow, client documents would go to a local model running on our own servers, and the code is already built so that's a config switch." |
| 1:55 | Close | Link to repo |

## Repo checklist

- README states the demo/production split in one line.
- `docs/superpowers/specs/` and the design plan included.
- Tests pass.
- Pushed to a public repo and tested from the link.

## Intro message

Short note to the founders with the Loom and repo links, one sentence on why it fits Gale (attorneys in the loop, TypeScript/React/Postgres/Effect stack, documents and LLM workflows) and the same demo/production line as the Loom.

## Open items

- Founder names and the send channel are not in the design plan. Provide them when it's time to send.
- Sending the message is the user's action, not part of the build.
