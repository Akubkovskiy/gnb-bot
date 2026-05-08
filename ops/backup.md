# GNB Bot Backup

## Purpose

Provide the baseline backup-aware entrypoint without touching the root runtime prompt.

## Critical state

- local DB or generated document state if present outside git
- template artifacts and working directories
- `.env` and any operator-managed non-committed config

## Rule

Use shared memory for durable project facts, not for raw generated artifacts.
Before risky changes, identify:
- what is reproducible from repo state
- what exists only in local or server-side working directories
- how document pipeline state would be recovered after interruption
