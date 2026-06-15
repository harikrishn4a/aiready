# Init Command — Implementation Prompts

Ready-to-use prompts for generating or restructuring each harness file. Reference `/init-redesign-prompts.md` for detailed rules.

---

## AGENTS.md

```
You are generating AGENTS.md for a {{PROJECT_TYPE}} project.

STRUCTURE (maintain this order, never reorder):
1. What this is
2. Current stage
3. Stack
4. Repo structure
5. Session start
6. Session end
7. Working rules
8. Completion gate
9. Verification commands
10. Escalation
11. Constraints

FIXED SECTIONS (copy exactly, customize only placeholders):
- Session start: Keep all 7 steps exactly as shown, customize init.sh and git commands to match this repo
- Session end: Keep all 6 steps exactly, customize feature file names if different
- Working rules: Keep structure and phrasing patterns, make specific to this repo's workflow
- Completion gate: Keep checkbox structure
- Escalation: Keep patterns (Architecture → DECISIONS.md, etc.)
- Constraints: Keep reference to CONSTRAINTS.md

CUSTOMIZABLE SECTIONS (fill placeholders with project-specific content):
- What this is: {{ONE_PARAGRAPH_DESCRIPTION}} — what product does, who it's for, what problem it solves
- Current stage: {{WHAT_IS_BEING_BUILT_RIGHT_NOW}} — follow format: "Stage X — title. description."
- Stack: {{LANGUAGE_AND_RUNTIME}}, {{FRAMEWORK}}, {{DATABASE}}, {{TEST_RUNNER}}, {{BUILD_TOOL}}
- Repo structure: Show actual modules with {{RESPONSIBILITY}} descriptions
- Verification commands: Real commands that work for this repo (reference Makefile targets)

MODE: generate from scratch if file doesn't exist. If file exists, extract content, restructure into canonical order (listed above), suggest removal of old file.
```

---

## structure.md

```
You are generating STRUCTURE.md for a {{PROJECT_TYPE}} project.

KEEP:
- Intro: "How artifacts are organised in this repository"
- Project structure code block format
- Ownership table structure and column headers

CUSTOMIZE:
- File tree: Show actual files in this repo (AGENTS.md, CONSTRAINTS.md, etc.)
- Ownership rows: Based on how this project's team will use the harness
- File descriptions: Project-specific language

STYLE: Similar to examples but project-specific. Descriptions should be clear and concise.

MODE: Generate from scratch matching template structure. If file exists, restructure to canonical form.
```

---

## startup.md

```
You are generating STARTUP.md for a {{PROJECT_TYPE}} project.

KEEP:
- Table format: Action | Command
- Section headings: Start commands, Current state, Project structure
- "Current state" subsections: Dependencies, Tests, Lint

CUSTOMIZE:
- Commands: Replace npm with this project's package manager (pip, cargo, go, etc.)
- Current state: Real numbers/status (e.g., "Tests: 42/50 passing")
- Project structure: Show actual directory layout

STYLE: Concise. Commands should reference Makefile targets (make test, make dev, etc.) where possible.

MODE: Generate from scratch. If file exists, restructure to canonical format.
```

---

## architecture.md

```
You are generating ARCHITECTURE.md for a {{PROJECT_TYPE}} project.

KEEP:
- Section structure: Overview, Module map, Data flow, Key invariants
- Code block format for module map and data flow diagrams
- Explanatory style

CUSTOMIZE:
- Overview: One-paragraph summary of architectural layers and data flow
- Module map: Real module names with {{RESPONSIBILITY}} descriptions
- Data flow: ASCII diagram showing actual request/execution flow
- Key invariants: Architectural rules specific to this codebase

STYLE: Similar to examples but project-specific. Module map should show actual file structure.

MODE: Generate from scratch. If file exists, extract architectural info, restructure to canonical form.
```

---

## constraints.md

```
You are generating CONSTRAINTS.md for a {{PROJECT_TYPE}} project.

KEEP:
- MUST / MUST NOT language throughout
- Section structure (Scope, Verification, Artifacts, Dependencies, etc.)
- Exact phrasing patterns ("MUST work on", "MUST NOT remove", etc.)

CUSTOMIZE:
- Scope: Add constraints specific to how features are worked on
- Verification: Add verification constraints
- Artifacts: Add artifact management rules
- Dependencies: Add dependency rules
- DOMAIN-SPECIFIC SECTIONS: Add real sections with real constraints (NOT placeholder sections like "## {{DOMAIN_SPECIFIC_SECTION}}")

CRITICAL: Do not leave placeholder sections. Every section should contain real, project-specific constraints.

STYLE: Strict, unambiguous MUST/MUST NOT language only.

MODE: Generate from scratch with real constraints. If file exists, extract constraints, restructure into MUST/MUST NOT format.
```

---

## decisions.md

```
You are generating DECISIONS.md for a {{PROJECT_TYPE}} project.

KEEP:
- Intro: "Record every significant architectural or dependency decision here"
- "Template" section: Format exactly as shown (YYYY-MM-DD, Decision, Reason, Rejected alternatives, Constraints, Revisit when)
- "Example" section: One example decision showing the format

CUSTOMIZE:
- If generating from scratch with existing decisions: Add 1-2 actual decisions made so far
- If no decisions yet: Show template + one realistic example decision for this project type
- If file exists: Extract decisions, restructure to match template format

STYLE: Each decision follows the template format exactly. Clear rationale and constraints.

MODE: Generate from scratch matching template. If file exists, restructure to canonical form with preserved decisions.
```

---

## task.md

```
You are generating TASK.md for a {{PROJECT_TYPE}} project.

STRUCTURE (maintain exactly):
1. Feature (ID, Title)
2. Scope — what will change
3. Exclusions — what will NOT change
4. Files expected to change
5. Verification standard
6. Acceptance criteria
7. Invariants — must remain true throughout
8. Example (filled version)

CUSTOMIZE:
- Feature: Use actual feature ID and title from feature_list.json
- Scope: List actual changes for this feature
- Exclusions: List what's explicitly NOT included
- Files expected to change: Real file paths
- Verification standard: Commands that must pass
- Acceptance criteria: User-visible behavior
- Invariants: Rules that must stay true
- Example: Show a filled task for a feature in this repo

CRITICAL: Keep all sections exactly as shown. Never reorder.

MODE: Generate from scratch with initial feature, or current feature if one is active.
```

---

## progress.md

```
You are generating PROGRESS.md for a {{PROJECT_TYPE}} project.

STRUCTURE (maintain exactly):
1. Current State (Latest commit, Test status, Lint)
2. Completed (checklist)
3. In Progress (checklist)
4. Known Issues (list)
5. Next Steps (numbered list)

CUSTOMIZE:
- Current State: Real commit hash, actual test count, lint status
- Completed: Actual completed features/tasks
- In Progress: What's actively being worked on
- Known Issues: Real bugs or blockers in this codebase
- Next Steps: What should happen next

STYLE: Use real project state. Replace pagination example with actual current work.

CRITICAL: Keep all sections exactly as shown. Never reorder.

MODE: Generate from scratch with realistic state. If file exists, extract content, restructure to canonical order.
```

---

## session-handoff.md

```
You are generating SESSION-HANDOFF.md for a {{PROJECT_TYPE}} project.

STRUCTURE (maintain exactly):
1. Date
2. What was completed
3. Verification run (table with Command | Result)
4. What is broken or unverified
5. Next best step (Feature, Start from, Pass when)
6. Must not change

CUSTOMIZE:
- Date: Today's date in YYYY-MM-DD format
- What was completed: Actual work from this session
- Verification run: Real commands and their results (pass/fail)
- What is broken: Real blockers or failing tests
- Next best step: Next feature to work on (with feature ID and title from feature_list.json)
- Must not change: Invariants for next session

CRITICAL: Keep all sections exactly as shown. Never reorder.

MODE: Generate from scratch for initial session. Usually overwritten by agent at end of each session.
```

---

## quality.md

```
You are generating QUALITY.md for a {{PROJECT_TYPE}} project.

STRUCTURE (maintain exactly):
1. Domains (table)
2. Architectural layers (table)
3. Change log (entries by date)

KEEP:
- Table structure and column names
- Section headings

CUSTOMIZE:
- Domains rows: Replace with actual project domains (e.g., API, Frontend, Auth, etc.)
- Architectural layers rows: Replace with actual layers (e.g., Handler, Service, DB, etc.)
- Grades: Leave as — for new projects, or fill with actual grades if assessment exists
- Change log: Empty for new projects, or fill with actual changes

STYLE: One row per domain/layer. Grades use letters (A/B/C/D) per QUALITY-DOCUMENT.md scale.

CRITICAL: Keep table structure exactly. Never reorder columns.

MODE: Generate from scratch with empty grades. If file exists, restructure to canonical format and preserve grades.
```

---

## feature-list.json

```
You are generating feature-list.json for a {{PROJECT_TYPE}} project.

KEEP:
- All top-level fields: project, last_updated, rules, status_legend, features array
- Feature object structure: id, priority, area, title, user_visible_behavior, status, blocked_reason, verification, evidence, agent_notes, last_updated
- rules and status_legend exactly as shown

CUSTOMIZE:
- project: {{PROJECT_NAME}}
- last_updated: YYYY-MM-DD (today)
- features: Array of actual features for this project
  - id: feat-001, feat-002, etc.
  - priority: 1, 2, 3, etc.
  - area: Project-specific areas (e.g., "auth", "api", "ui")
  - title: Feature title
  - user_visible_behavior: What user sees
  - status: "not_started", "in_progress", "blocked", or "passing"
  - verification: Array of verification steps
  - Other fields: Leave as empty string or empty array initially

CRITICAL: Valid JSON. All strings in quotes. Arrays properly formatted.

MODE: Generate from scratch with actual features. If file exists, restructure and preserve feature data.
```

---

## Makefile

```
You are generating Makefile for a {{PROJECT_TYPE}} project.

KEEP:
- Target names: setup, dev, check, test, lint, clean, build, typecheck, format
- .PHONY declaration
- Comment structure and inline documentation
- Help comments above each target

CUSTOMIZE:
- setup: Replace ./scripts/init.sh with actual install command for this stack
  - npm install, pip install -r requirements.txt, cargo build, go mod download, etc.
- dev: Replace npm run dev with dev command for this stack
  - uvicorn main:app --reload, air, cargo watch, npm run dev, etc.
- check: Full verification (build + typecheck + lint + test)
  - Replace ./scripts/verify.sh with actual command or chain of commands
- test: Replace npm test with test command for this stack
- lint: Replace npm run lint with lint command
- typecheck: Replace npm run typecheck if applicable (remove if language has no type checker)
- build: Replace npm run build if applicable
- clean: Replace rm -rf dist/ with actual clean command

STYLE: Keep comments and structure. Preserve target names — agents expect these.

MODE: Generate from scratch matching template. Adapt all commands to this project's package manager and toolchain.
```

---

## quality-document.md

```
You are generating QUALITY-DOCUMENT.md for a {{PROJECT_TYPE}} project.

KEEP:
- Entire content exactly as shown in examples
- Grading scale (A/B/C/D definitions)
- Section structure

CUSTOMIZE:
- Product Domains table: Replace rows with actual project domains
- Architectural Layers table: Replace rows with actual layers
- Change History: Start empty or fill with actual changes

CRITICAL: Do not remove or change the grading scale definitions. Keep A/B/C/D exactly.

MODE: Generate from examples. Customize only domain and layer rows.
```

---

## clean-state-checklist.md

```
You are generating CLEAN-STATE-CHECKLIST.md for a {{PROJECT_TYPE}} project.

KEEP:
- All checklist items exactly as shown in examples
- Format and structure

CUSTOMIZE:
- Only customize file names if they differ (e.g., if project uses TODO.md instead of features.md)
- Replace ./init.sh with actual init command if different
- Otherwise: Copy examples version as-is

MODE: Copy from examples. Minimal customization.
```

---

## evaluator-rubric.md

```
You are generating evaluator-rubric.md for a {{PROJECT_TYPE}} project.

KEEP:
- Entire content exactly as shown in examples
- All categories and questions
- Verdict and Follow-Up sections

CUSTOMIZE:
- Nothing. Copy examples version exactly.

MODE: Copy from examples. No customization.
```

---

## feature-list-schema.json

```
You are generating feature-list-schema.json for a {{PROJECT_TYPE}} project.

KEEP:
- Entire content exactly as shown in examples
- All schema definitions
- All field types and structure

CUSTOMIZE:
- Nothing. Copy examples version exactly.

MODE: Copy from examples. No customization.
```
