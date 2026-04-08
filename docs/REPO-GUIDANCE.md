# GNB Bot - Repo Guidance

## What This Repo Is

`gnb-bot` is the implementation repo for the GNB engineering documentation assistant.

It combines:
- Telegram bot runtime
- document intake and extraction
- template generation
- SQLite knowledge/state
- bot-specific Claude prompt and skill surfaces

This repo is unusual because the root `CLAUDE.md` is part of the live runtime prompt surface and should not be casually repurposed as a generic repo guide.

## Read First

Before editing anything, inspect:

1. `STATUS.md`
2. `INDEX.md`
3. `docs/BOT_INSTRUCTION.md`
4. `docs/FIELD-MAP.md`
5. `docs/RUNTIME-DEBUG-TO-DATA-MAP.md`
6. `src/index.ts`
7. `src/telegram/handlers.ts`
8. `src/intake/`
9. `src/db/`
10. `memory/projects/gnb-bot.md`
11. `memory/bots/gnb.md`

## Guidance Split

- root `CLAUDE.md` = runtime/system prompt surface
- `docs/REPO-GUIDANCE.md` = repo-local operator guidance
- `STATUS.md` + `INDEX.md` = lightweight project-pack entrypoints

That split is intentional to avoid breaking bot behavior while still making the repo legible for operators and agents.

## Structure Tier

Treat this repo as Tier 2 moving toward Tier 3.

## Memory Structure

This repo uses the shared Obsidian memory model from `ai-infra`, but it also owns local runtime memory/state.

Primary durable notes:
- `memory/projects/gnb-bot.md`
- `memory/bots/gnb.md`

Use shared memory for:
- durable project status
- architecture decisions
- milestone progress
- cross-repo ecosystem context

Do not use shared memory for:
- live intake session state
- raw extracted document payloads
- local SQLite contents
- transient bot/runtime traces

Important local/runtime state outside Obsidian:
- `.env`
- `.gnb-memory/` or configured memory dir
- `gnb.db`
- `temp_files/`
- templates and generated artifacts
- root `CLAUDE.md` as runtime prompt surface

## High-Risk Areas

- root `CLAUDE.md`
- `src/telegram/handlers.ts`
- `src/intake/`
- `src/db/`
- template scripts under `scripts/`
- any code that changes generated document semantics

## Safe Working Rules

- Do not casually rewrite root `CLAUDE.md`; it is runtime behavior.
- Prefer additive repo guidance in `docs/` and `ops/`.
- Treat SQLite and generated artifacts as real state, not scratch data.
- If changing intake or review flow, preserve session continuity and field mapping integrity.
