# GNB Bot Target Scenarios

Status: reference
Date: 2026-03-17
Purpose:

This document is the product north star for `gnb-bot`.
Use it to check whether implementation is moving toward the intended assistant behavior.

## 1. Core Product Idea

`gnb-bot` is not only a parser and not only a generator.

It is a working PTO assistant for GNB documentation:
- the owner can speak naturally
- the owner can upload real documents
- the bot remembers people, organizations, materials, and previous transitions
- the bot reuses what already exists
- the bot asks only for missing or changed data
- the bot builds a GNB passport for review
- the bot generates the final package
- the bot stores the resulting document set for future reuse

## 2. Scenario: New GNB From Voice/Text and Uploaded Documents

Target behavior:
1. The owner names the object using a real working name or alias.
2. The owner says the new GNB number and the key facts.
3. The owner uploads:
   - executive scheme
   - pipe passport
   - supporting templates or prior examples
4. The bot extracts data from the uploads.
5. The bot searches the DB for:
   - previous transitions on this object
   - known organizations
   - signatories
   - reusable documents
6. The owner can then say natural corrections:
   - replace one person with another
   - change the role source
   - set dates
   - change address
7. The bot updates the draft and asks only what is still missing.
8. The bot shows a GNB passport and document/reuse summary.
9. The owner confirms or comments.
10. The bot generates the full package.

## 3. Scenario: Standalone Save Data Flow

Target behavior:
1. The owner uploads a document without starting a full GNB flow.
2. The owner may explicitly say `save data`.
3. The bot classifies and extracts the document.
4. The bot asks the missing linking question:
   - which object does this belong to?
   - is it tied to a person, material, organization, or transition?
5. The bot saves the structured result into the DB.
6. Later the bot can retrieve and reuse this document automatically.

This scenario is important because the owner may want to preload the knowledge base before a real GNB draft exists.

## 4. Scenario: Reuse From Previous Object / Transition

Target behavior:
1. The owner says:
   - use the same passport as on the previous transition
   - reuse the same tech supervisor
   - use the same pipe docs as before
2. The bot finds the best candidates in the DB.
3. If one clear match exists, the bot proposes it directly.
4. If several plausible matches exist, the bot offers short choices.
5. After confirmation, the bot attaches the chosen document/person/material to the new draft.

## 5. Scenario: Delta Workflow

Target behavior:
1. A new GNB is very similar to the previous one.
2. Only a few fields change:
   - GNB number
   - address
   - work dates
   - lengths / geometry
3. The bot should assume continuity and avoid asking everything again.
4. The bot should ask only:
   - what changed
   - what is missing
   - what is ambiguous

This is one of the highest-value workflows and should strongly influence the reasoning and reuse logic.

## 6. Scenario: Lookup Query

Target behavior:
1. The owner asks a natural question such as:
   - what do we have for Gaydukov?
   - what pipe passports exist for this object?
   - what materials do we already have?
2. The bot performs code-side retrieval from the DB.
3. The bot returns a short human answer:
   - what was found
   - why it is relevant
   - what can be reused now

## 7. Scenario: Review and Acceptance

Target behavior:
1. The bot produces a passport/review summary.
2. The summary clearly separates:
   - inherited
   - changed
   - reused
   - unresolved conflicts
   - missing required data
   - missing required documents
3. The owner can approve or comment.
4. The bot updates the draft and repeats the review if needed.

## 8. Scenario: Storage and Cloud Outcome

Target behavior:
1. After confirmation, the bot generates the final files.
2. The bot ensures that:
   - generated files are linked to the transition
   - reused files are copied or linked into the new transition storage area
   - the final package is stored in the correct directory/cloud structure
3. Later the same assets can be found and reused on the next transition.

## 9. Architecture Implications

If implementation does not support these scenarios, it is not yet on the right track.

This means:
- retrieval must stay in code
- skills must reason over retrieval context
- aliases and natural language must be supported
- standalone save-to-DB flow matters
- delta workflow matters
- storage outcome matters

## 10. Implementation Check Questions

Before or after each phase, ask:
- Does this help the bot understand natural owner input?
- Does this improve reuse from the DB?
- Does this reduce repeated owner input?
- Does this help the bot ask only for missing or changed data?
- Does this move the system toward a full working PTO assistant?
