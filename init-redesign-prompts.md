# Init Command Redesign — File-by-File Prompts

Based on analysis of `/examples/` folder. Two modes: generate from scratch (no canonical file exists) or restructure existing.

---

## Category 1: AGENTS.md — Customizable with Structured Placeholders

**Process:**
1. If file doesn't exist: Generate from scratch using template structure
2. If file exists: Extract content, restructure into canonical form

**Structure to maintain (do not reorder):**
- What this is
- Current stage
- Stack
- Repo structure
- Session start (keep steps 1-7 exactly as shown)
- Session end (keep steps 1-6 exactly as shown)
- Working rules (keep phrasing, customize to repo)
- Completion gate (keep checkbox structure)
- Verification commands
- Escalation
- Constraints

**Customization rules:**
- {{ONE_PARAGRAPH_DESCRIPTION}}: Write what the product does, who it's for, what problem it solves
- {{WHAT_IS_BEING_BUILT_RIGHT_NOW}}: Name the specific stage/milestone actively under development. Follow the example format: "Stage X — {{title}}. {{one-line description}}."
- {{LANGUAGE_AND_RUNTIME}}, {{FRAMEWORK_OR_KEY_LIBRARIES}}, etc.: Fill with actual stack
- {{PROJECT_ROOT}}, {{MODULE}}, {{RESPONSIBILITY}}: Show actual directory structure with real module names
- {{PRIMARY_VERIFICATION_COMMAND}}, {{VERIFICATION_COMMANDS}}: Commands that must pass before feature is complete (should reference Makefile targets)
- Working rules: Keep structure and phrasing patterns, customize to repo workflow
- Verification commands: Must reference actual commands that work for this repo

**Placeholders to preserve (do not fill in):**
- None — all placeholders should be filled with project-specific content

**Example placeholder customization:**
```
Template: {{ONE_PARAGRAPH_DESCRIPTION}}
Example: "A TypeScript REST API service that manages user accounts and permissions. Built with Node.js 20+, Express, and PostgreSQL. Version 2.1.0."

Template: {{WHAT_IS_BEING_BUILT_RIGHT_NOW}}
Example: "Stage 1 — CLI audit command. Deterministic, no LLM. Scores repo against 5 harness subsystems."
```

---

## Category 2: structure.md, startup.md, architecture.md, constraints.md, decisions.md — Structure Maintained, Content Customized

**Process:**
1. If file doesn't exist: Generate from scratch matching template structure and style
2. If file exists: Extract content, restructure to match canonical order, add missing sections

**For each file:**

### structure.md
- Keep heading: "How artifacts are organised in this repository"
- Keep project structure layout
- Keep ownership table headings and rows
- Customize: File list and descriptions to match actual project files
- Customize: Ownership assignments based on project's actual team/workflow
- Style: Similar descriptions but project-specific language

### startup.md
- Keep table headings: "Action | Command"
- Keep "Current state" section with same subsections
- Keep "Project structure" code block
- Customize: Commands to match actual make targets and project's package manager
- Customize: Current state (dependencies installed, tests passing, lint status) with real numbers/status
- Customize: Project structure to show actual layout

### architecture.md
- Keep heading and intro paragraph style
- Keep "Module map" section heading and code block format
- Keep "Data flow" section and diagram style
- Keep "Key invariants" section
- Customize: Module map with actual modules and their responsibilities
- Customize: Data flow diagram to match actual architecture
- Customize: Key invariants specific to this codebase's architectural rules

### constraints.md
- Keep MUST / MUST NOT language throughout
- Keep section structure (Scope, Verification, Artifacts, Dependencies, etc.)
- Keep exact phrasing patterns ("MUST work on", "MUST NOT remove", etc.)
- Replace {{DOMAIN_SPECIFIC_SECTION}}: Add project-specific constraint sections
- Customize: Fill each MUST / MUST NOT with actual project rules
- Do not create placeholder sections like `## {{DOMAIN_SPECIFIC_SECTION}}`; instead add real sections with real constraints

### decisions.md
- Keep "Record every significant architectural or dependency decision here" intro
- Keep "Template" section with format exactly as shown (YYYY-MM-DD title, Decision/Reason/Rejected alternatives/Constraints/Revisit when)
- Keep "Example" section structure
- Customize: For generate-from-scratch: add 1-2 actual decisions made so far (or show empty if none yet)
- Customize: For existing file: preserve existing decisions, restructure to match template format

---

## Category 3: task.md, progress.md, session-handoff.md, quality.md — Exact Structure, Customized Content

**Rule: Maintain exact heading structure, section names, and formatting. Only customize content.**

### task.md
- Keep all headings: Feature, Scope, Exclusions, Files expected to change, Verification standard, Acceptance criteria, Invariants
- Keep "Example" section structure and format
- Customize for generate: Create initial task for first unstarted feature (or show empty template if no features yet)
- Customize for existing: If TASK.md exists, extract and restructure to canonical format

### progress.md
- Keep headings: Current State, Completed, In Progress, Known Issues, Next Steps
- Keep table/list formats exactly as shown
- Customize: Replace pagination example with actual project state
- Customize: Real commit hashes, test counts, feature names
- Customize: Actual completed features, in-progress work, known issues

### session-handoff.md
- Keep all sections: Date, What was completed, Verification run, What is broken or unverified, Next best step, Must not change
- Keep table format for verification run
- Customize: Fill with actual session state (or show as template if new project)
- Customize: Real feature IDs and titles
- Customize: Actual verification command results

### quality.md
- Keep headings: Domains, Architectural layers, Change log
- Keep table structure and column names exactly
- Customize: Replace {{DOMAIN}} and {{LAYER}} rows with actual project domains/layers
- Customize: Add real domain and layer names (keep table structure, just add rows)
- Customize: For generate-from-scratch: leave grades and fields empty (—)
- Customize: For existing: fill with actual grades if assessment exists

---

## Category 4: feature-list.json, feature-list-schema.json, Makefile — Structure Maintained

### feature-list.json
- Keep all fields: project, last_updated, rules, status_legend, features array
- Keep field structure within each feature object: id, priority, area, title, user_visible_behavior, status, blocked_reason, verification, evidence, agent_notes, last_updated
- Customize: "project": Replace {{PROJECT_NAME}} with actual project name
- Customize: Add initial features from actual feature list (or empty array if none yet)
- Customize: "area": Project-specific feature areas (e.g., "auth", "dashboard", "data-import")
- Customize: "verification": Actual verification steps for each feature

### feature-list-schema.json
- Keep exactly as-is. This is a standard schema definition. Do not customize.

### Makefile
- Keep target names: setup, dev, check, test, lint, clean, build, typecheck, format
- Keep comment structure and inline documentation
- Keep .PHONY declaration
- Customize: Commands inside each target to match project's actual stack
- Examples:
  - `setup`: Replace `./scripts/init.sh` with appropriate install command (npm install, pip install, cargo build, etc.)
  - `dev`: Replace `npm run dev` with project's dev command (uvicorn, air, cargo watch, etc.)
  - `check`: Replace `./scripts/verify.sh` with full verification command or appropriate script
  - `test`: Replace `npm test` with project's test runner (pytest, cargo test, go test, etc.)
  - etc.

---

## Category 5: quality-document.md, clean-state-checklist.md, evaluator-rubric.md — Largely Unchanged

### quality-document.md
- Keep grading scale definitions (A/B/C/D) exactly as shown
- Keep section headings: Product Domains, Architectural Layers, Change History
- Keep table structure and column names
- Customize: Replace domain rows (Document Import, Document Management, etc.) with actual project domains
- Customize: Replace layer rows (Main Process, Preload, Renderer, Services) with actual architectural layers
- Customize: Fill in change history with actual project changes (or start empty)
- **Do not remove or change the grading scale definitions**

### clean-state-checklist.md
- Keep all checklist items exactly as shown
- Customize: Only if file names differ from standard (e.g., if project uses TODO.md instead of features.md)
- Customize: Replace `./init.sh` with actual project's init command if different
- Otherwise: Copy as-is

### evaluator-rubric.md
- Keep exactly as-is
- Do not customize
- This is a universal rubric applied the same way to all projects

---

## Implementation Guidance

### When file doesn't exist (generate from scratch):
1. Read the template from examples/
2. Understand the structure and section order
3. Analyze the project to fill placeholders appropriately
4. Use similar style/complexity/tone as examples but with project-specific content

### When file exists (restructure):
1. Extract all content from existing file
2. Identify which sections map to canonical sections
3. Reorder into canonical structure from top down
4. Add missing sections (in order)
5. Suggest removal of old file if it was non-canonical

### Placeholder preservation:
- In agents.md and structure.md: Fill ALL placeholders with project-specific content
- In constraint.md: Do not create empty placeholder sections like `## {{DOMAIN_SPECIFIC_SECTION}}`; instead add real project-specific constraints
- In other files: No placeholders should remain

### Order preservation:
- Never reorder sections within agents.md, task.md, progress.md, session-handoff.md, quality.md
- Structure order shown in examples IS the canonical order
