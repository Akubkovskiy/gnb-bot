# GNB Bot - Repo Guidance

## What This Repo Is

`gnb-bot` is the implementation repo for the GNB engineering documentation assistant.

It combines:
- Telegram bot runtime
- document intake and extraction
- template generation
- SQLite knowledge/state
- bot-specific Claude prompt and skill surfaces

This repo is unusual because its live runtime prompt is stored alongside repo docs and must be kept separate from operator guidance.

## Read First

Before editing anything, inspect:

1. `STATUS.md`
2. `INDEX.md`
3. root `CLAUDE.md`
4. `docs/RUNTIME-PROMPT.md`
5. `docs/BOT_INSTRUCTION.md`
6. `docs/FIELD-MAP.md`
7. `docs/RUNTIME-DEBUG-TO-DATA-MAP.md`
8. `src/index.ts`
9. `src/telegram/handlers.ts`
10. `src/intake/`
11. `src/db/`
12. `memory/projects/gnb-bot.md`
13. `memory/bots/gnb.md`

## Guidance Split

- root `CLAUDE.md` = repo-local project pack
- `docs/RUNTIME-PROMPT.md` = runtime/system prompt surface
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
- `docs/RUNTIME-PROMPT.md` as runtime prompt surface

## High-Risk Areas

- `docs/RUNTIME-PROMPT.md`
- `src/telegram/handlers.ts`
- `src/intake/`
- `src/db/`
- template scripts under `scripts/`
- any code that changes generated document semantics

## Safe Working Rules

- Do not casually rewrite `docs/RUNTIME-PROMPT.md`; it is runtime behavior.
- Prefer additive repo guidance in `docs/` and `ops/`.
- Treat SQLite and generated artifacts as real state, not scratch data.
- If changing intake or review flow, preserve session continuity and field mapping integrity.
