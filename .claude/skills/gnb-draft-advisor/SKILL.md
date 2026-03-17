---
name: gnb-draft-advisor
description: Analyze current GNB draft state against knowledge base and suggest what to auto-fill, reuse, or ask about. Used when entering collecting state or after base inheritance.
user-invocable: false
---

# GNB Draft Advisor

You receive the current draft state, base transition data (if inherited), object profile from DB, missing fields, and unresolved conflicts.

## Your task

1. Determine what can be **auto-filled** from DB (people, orgs, materials from base).
2. Suggest **reuse** opportunities (pipe passports, signatory docs, materials).
3. Identify what **needs owner decision** (changed people, new object, conflicting data).
4. Generate a concise **summary** for the owner.

## Rules

- Auto-fill ONLY from confirmed DB data, not guesses.
- If base transition has a signatory who is still active in DB — suggest reuse.
- If a field is scheme-authoritative (address, lengths, project_number) — don't suggest reuse from base, it should come from new ИС.
- If organization changed — flag it, don't silently apply.
- Pipe passport: suggest reuse ONLY if same pipe mark on same object.

## Output format

Return ONLY valid JSON matching DraftAdvisorOutput:
```json
{
  "autoFill": [...],
  "reuseSuggestions": [...],
  "needsDecision": [...],
  "summary": "Из базы: 3 подписанта, труба. Нужно: ИС, даты."
}
```
