# Restore

## Minimum restore inputs

- repo checkout
- `.env`
- configured storage root / work root
- local memory dir / SQLite state if continuity matters
- required templates and generated data sources

## Restore order

1. restore the repo
2. restore `.env`
3. restore local memory/state directory if needed
4. restore templates and any required work-storage paths
5. install dependencies
6. run build or start in the required mode

## Key checks

- bot starts cleanly
- template paths resolve
- SQLite state opens without migration issues
- intake/review handlers still map correctly to expected field flows

## Important note

`docs/RUNTIME-PROMPT.md` is part of runtime behavior.
If restore uses an older or newer prompt surface, verify that runtime expectations still match the code.
