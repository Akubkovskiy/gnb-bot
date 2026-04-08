# gnb-bot Status

Updated: 2026-04-08
Tier: Tier 2 moving toward Tier 3
Runs on: operator machine and bot runtime surfaces

## What This Repo Owns

- Telegram GNB documentation assistant
- document intake and extraction flows
- template-based output generation
- SQLite knowledge/state
- runtime prompt and skill surfaces

## Runtime Shape

- root `CLAUDE.md` is part of the live runtime prompt surface
- `docs/REPO-GUIDANCE.md` is the operator guidance layer
- `src/intake/`, `src/telegram/`, `src/db/` hold the core logic
- templates and generated artifacts are part of the real workflow

## Production-Sensitive State

- `.env`
- runtime memory dir if configured
- local SQLite / extracted payloads
- `temp_files/`
- generated document artifacts
- root `CLAUDE.md`

## High-Risk Zones

- root `CLAUDE.md`
- `src/telegram/handlers.ts`
- `src/intake/`
- `src/db/`
- template generation scripts

## Current Working Rule

Enter through `STATUS.md`, `INDEX.md`, and `docs/REPO-GUIDANCE.md`.
Do not repurpose the root `CLAUDE.md` as repo guidance.
