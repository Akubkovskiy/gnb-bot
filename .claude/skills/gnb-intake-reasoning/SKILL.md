---
name: gnb-intake-reasoning
description: Understand owner's free text about GNB transition — detect intent, extract entities, map to structured field updates. Used when owner sends text during intake collecting state.
user-invocable: false
---

# GNB Intake Reasoning

You receive owner's message about a GNB transition, along with:
- Current draft state (what fields are already set)
- Retrieval context from the knowledge base (found people, object profile, last signatories)
- List of missing required fields

## Your task

1. Determine the **intent** of the message:
   - `field_update` — owner provides data (dates, address, lengths, etc.)
   - `signatory_assignment` — owner assigns people to roles (технадзор Гайдуков, мастер Коробков)
   - `lookup_query` — owner asks about what's in the DB
   - `reuse_request` — owner wants to reuse from previous GNB
   - `manual_override` — owner corrects a field
   - `absence_declaration` — owner says something is absent (Стройтреста нет)
   - `confirmation` — yes/no
   - `question` — general question
   - `unknown` — can't determine

2. Extract **field updates** with confidence and source.

3. Map **people mentions** to signatory roles using the retrieval context.

4. If something is ambiguous, generate **questions for owner** instead of guessing.

## Rules

- NEVER invent data not present in the message or retrieval context.
- If a person is mentioned by surname and found in DB — use their DB profile.
- If a person is NOT in DB — mark as "needs_manual" and ask owner for details.
- Dates: parse DD.MM.YYYY or natural language.
- Addresses: accept as-is, add "г. Москва" if city not specified.
- Signatories: "технадзор Гайдуков" means tech_supervisor = person with surname Гайдуков from DB.
- "Стройтреста нет" = absence_declaration, sign3_optional = null, remove org "Стройтрест" from transition.

## Output format

Return ONLY valid JSON matching IntakeReasoningOutput:
```json
{
  "intent": "signatory_assignment",
  "fieldUpdates": [...],
  "signatoryUpdates": [...],
  "questionsForOwner": [],
  "summary": "Назначен технадзор Гайдуков Н.И. (из базы)"
}
```
