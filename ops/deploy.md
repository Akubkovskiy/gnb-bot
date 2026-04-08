# Deploy

## Current reality

The primary production/runtime path is not a simple standalone deploy from this repo.

`gnb-bot` currently runs through the broader `ClaudeBot` runtime on FI, while this repo is the main implementation surface.

## Safe deploy interpretation

For now, deploy-related work means:
- update the implementation repo safely
- understand whether corresponding runtime changes are needed in `ClaudeBot`
- avoid assuming that `npm run build && npm run start` is the production path

## Minimum checks before runtime-impacting changes

- identify whether the change affects `docs/RUNTIME-PROMPT.md`
- identify whether the change affects `.claude/skills/` or runtime skill behavior
- identify whether templates or SQLite state expectations changed
- verify whether `ClaudeBot` runtime profile also needs matching updates

## Unknowns

- no single canonical production deploy command is documented yet for this standalone repo
- rollback is not standardized as a one-command path

## Rollback note

Practical rollback today is previous code state plus reverting any matching runtime/profile changes in the place that actually executes the bot.
