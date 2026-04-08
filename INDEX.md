# gnb-bot Index

## Start Here

1. `STATUS.md`
2. `docs/REPO-GUIDANCE.md`
3. root `CLAUDE.md`
4. `docs/RUNTIME-PROMPT.md`
5. `ops/deploy.md`
6. `ops/backup.md`
7. `ops/restore.md`

## By Task

### Runtime prompt / bot behavior
- `docs/RUNTIME-PROMPT.md` (the single live runtime source)
- `skills/`

### Historical behavior archive (rarely needed, NOT runtime)
- `docs/BOT_INSTRUCTION.md` — may be divergent from runtime; do not treat as authoritative

### Telegram handler flow
- `src/index.ts`
- `src/telegram/handlers.ts`

### Intake and extraction
- `src/intake/`
- `docs/FIELD-MAP.md`
- `docs/RUNTIME-DEBUG-TO-DATA-MAP.md`

### Data / SQLite / state
- `src/db/`
- configured local runtime state

### Templates and generated artifacts
- `templates/`
- `scripts/`

## Shared Memory Links

- `memory/projects/gnb-bot.md`
- `memory/bots/gnb.md`
