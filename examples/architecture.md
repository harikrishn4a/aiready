> **Example** — Shows a module-level boundary document. Generate one per architectural layer in the actual project.

# Renderer Layer

Responsibilities:
- UI rendering
- User interactions

Must NOT:
- Access filesystem
- Access Node APIs directly

Use preload bridge instead.

