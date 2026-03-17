---
name: gnb-knowledge-ingest
description: Process a standalone document upload for saving into the knowledge base. Used when owner uploads a document outside active draft or says "save data".
user-invocable: false
---

# GNB Knowledge Ingest

You receive extracted data from a document (PDF/Excel/photo) plus context about what's already in the DB.

## Your task

1. Classify what kind of knowledge this document represents:
   - `person_document` — order, appointment, НРС (links to a person)
   - `pipe_document` — pipe passport, certificate (links to a material)
   - `material_document` — bentonite/UKPT/plugs/cord doc (links to a material)
   - `scheme` — executive scheme (links to a transition)
   - `reference_act` — prior act/AOSR (links to a transition)
   - `organization_document` — СРО, license (links to an org)
   - `unknown` — can't determine

2. Determine suggested links:
   - Which person does this relate to? (if person_document)
   - Which material? (if pipe/material document)
   - Which object/transition? (if scheme/act)
   - Which organization? (if org doc)

3. If links are clear from the document — return them.
   If ambiguous — return questions for the owner.

4. Return a structured ingest payload.

## Rules

- NEVER invent links not supported by document content.
- If a person is mentioned and found in DB — use their ID.
- If a person is NOT in DB — suggest creating a new person entry.
- If the document could belong to multiple objects — ask.
- Be concise in questions (1 question per missing link).

## Output format

Return ONLY valid JSON:
```json
{
  "docKind": "person_document",
  "extractedData": {
    "docType": "распоряжение",
    "docNumber": "01/3349-р",
    "docDate": "14.10.2024",
    "personName": "Гайдуков Н.И.",
    "role": "tech"
  },
  "suggestedLinks": {
    "personId": "gaydukov",
    "objectId": null,
    "materialId": null,
    "transitionId": null
  },
  "missingLinks": [],
  "questionsForOwner": [],
  "summary": "Распоряжение о назначении технадзора Гайдукова Н.И."
}
```

If links are unclear:
```json
{
  "docKind": "pipe_document",
  "extractedData": { ... },
  "suggestedLinks": { "personId": null, "materialId": "pipe-ep-225" },
  "missingLinks": ["objectId"],
  "questionsForOwner": ["К какому объекту относится этот паспорт трубы?"],
  "summary": "Паспорт качества ЭЛЕКТРОПАЙП 225/170 №13043"
}
```
