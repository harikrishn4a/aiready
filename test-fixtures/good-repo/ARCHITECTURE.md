# ARCHITECTURE.md — Example Repo

## Overview
This is a well-documented architecture file showing module responsibilities
and clear layer boundaries. It exists to test the memory subsystem scoring.

## Module map

```
src/
  cli.ts        ← Commander entrypoint, routes commands to stage modules
  audit/        ← Stage 1: deterministic repo scoring, no LLM
    index.ts    ← audit command handler
    loader.ts   ← reads target repo files into memory
    scorer.ts   ← pure scoring function for 5 subsystems
  utils/        ← shared helpers used across stages
    fs.ts       ← filesystem helpers: read, exists, walk
```

## Layer boundaries

### cli.ts
- MUST only register commands and route to stage modules
- MUST NOT contain scoring logic

### audit/loader.ts
- MUST only read files — no scoring, no output
- MUST NOT write to the target repository
