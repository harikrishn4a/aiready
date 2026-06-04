> **Example** — Replace all `{{PLACEHOLDERS}}` with real feature content. Add one `---` block per feature; the agent fills in Notes as work progresses.

# FEATURES.md

Maintained by both human and agent.
- Human: writes initial feature definitions and acceptance criteria
- Agent: refines task breakdowns, checks off completed tasks, adds notes as work progresses

Status tracking lives in `feature_list.json`. This file is the narrative spec.

---

## Feature 001: {{FEATURE_TITLE}}

**What the user sees:**
{{USER_VISIBLE_BEHAVIOR}}

**Tasks:**
- [ ] {{TASK}}
- [ ] {{TASK}}

**Acceptance criteria:**
- {{CRITERION}}

**Out of scope:**
- {{EXCLUSION}}

**Notes:**
{{AGENT_NOTES}}

---

## Feature 002: {{FEATURE_TITLE}}

**What the user sees:**
{{USER_VISIBLE_BEHAVIOR}}

**Tasks:**
- [ ] {{TASK}}
- [ ] {{TASK}}

**Acceptance criteria:**
- {{CRITERION}}

**Out of scope:**
- {{EXCLUSION}}

**Notes:**
{{AGENT_NOTES}}