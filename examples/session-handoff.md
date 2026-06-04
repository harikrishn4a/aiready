> **Example** — Replace all `{{PLACEHOLDERS}}` with real session state. This file is overwritten by the agent at the end of every session.

# SESSION-HANDOFF.md

Overwritten at the end of every session. Agents read this at session start.

## Date
YYYY-MM-DD

## What was completed
- {{COMPLETED}}

## Verification run
| Command | Result |
|---|---|
| {{COMMAND}} | {{pass / fail}} |

## What is broken or unverified
- {{BROKEN_OR_UNVERIFIED}}

## Next best step
- Feature: {{FEATURE_ID}} — {{FEATURE_TITLE}}
- Start from: {{SPECIFIC_STARTING_POINT}}
- Pass when: {{ACCEPTANCE_CRITERIA}}

## Must not change
- {{INVARIANT}}