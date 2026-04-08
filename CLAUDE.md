# gnb-bot Project Pack

## What This Repo Is

`gnb-bot` is the implementation repo for the GNB engineering documentation assistant.

It owns:
- Telegram runtime and handler flow
- intake and extraction logic
- template-driven output generation
- SQLite-backed local state
- project-local ops and recovery notes

## Read First

1. `STATUS.md`
2. `INDEX.md`
3. `docs/REPO-GUIDANCE.md`
4. `ops/deploy.md`
5. `ops/backup.md`
6. `ops/restore.md`

## Prompt Routing

- `docs/RUNTIME-PROMPT.md` is the ONLY live runtime prompt source; the runtime loader fails loudly if it is missing
- root `CLAUDE.md` is the repo-local project pack for operators and coding agents
- `docs/BOT_INSTRUCTION.md` is a historical behavior archive, NOT a runtime source and NOT a fallback; it may be divergent from current runtime behavior
- read `docs/RUNTIME-PROMPT.md` only for runtime behavior, prompt surgery, or handler/prompt alignment work

## Memory Routing

Shared durable notes:
- `memory/projects/gnb-bot.md`
- `memory/bots/gnb.md`

Keep shared memory for:
- durable status
- architecture decisions
- milestone progress
- cross-repo context

Keep local runtime state out of shared memory:
- `.env`
- SQLite / local extracted payloads
- transient intake sessions
- generated artifacts
- temp files

## High-Risk Zones

- `docs/RUNTIME-PROMPT.md`
- `src/telegram/handlers.ts`
- `src/intake/`
- `src/db/`
- `templates/`
- document naming / storage placement logic

## Working Rules

- Do not treat the whole repo as startup context; enter through the pack above.
- If behavior changes depend on the bot prompt, inspect `docs/RUNTIME-PROMPT.md` before editing code.
- If a task is about runtime behavior, verify both prompt wiring and handler flow.
- If a task is about templates or generated documents, verify field mapping and naming conventions.
