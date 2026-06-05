# architecture.md — analytics-pipeline

> **Example** — Architecture doc in a docs/ subdirectory with a lowercase filename. The LLM-powered audit walks docs/ and correctly classifies this as a memory subsystem file.

## Overview
Event-driven pipeline: Kafka → Spark → Snowflake → dbt.
Two processing modes: real-time (streaming) and nightly batch.

## Module map
```
pipeline/
  consumers/      ← Kafka consumer group workers, one per event type
  processors/     ← Spark jobs: streaming (click/view) and batch (nightly rollups)
  loaders/        ← Snowflake COPY INTO wrappers, handles staging + swap
  transforms/     ← dbt model orchestration helpers
  utils/          ← Schema validation, dead-letter queue helpers, config parsing

tests/
  unit/           ← Pytest unit tests for processors and loaders
  integration/    ← End-to-end tests against local Kafka + mock Snowflake
```

## Data flow
```
Kafka topic (raw events)
    ↓
consumers/       deserialise, validate schema version
    ↓
processors/      Spark transformation: sessionise, aggregate
    ↓
loaders/         stage to Snowflake, swap into production table
    ↓
transforms/      dbt models build aggregate views and marts
    ↓
Snowflake (data warehouse)
```

## Key boundaries
- `consumers/` must never write directly to Snowflake — always go through `loaders/`
- `processors/` must not read Kafka — data is handed off as DataFrames
- `transforms/` calls dbt CLI — it does not import dbt as a Python library
