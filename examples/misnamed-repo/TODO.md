# TODO.md — analytics-pipeline

> **Example** — This repo uses TODO.md instead of PROGRESS.md for state tracking. The LLM correctly classifies it as a state subsystem file.

## Status
- Build: passing (CI green)
- Last verified: 2026-06-05
- Active: migrating Kafka consumers to new schema

## Done
- [x] Kafka consumer setup with auto-commit disabled
- [x] Spark structured streaming job for click events
- [x] Snowflake staging table loader
- [x] dbt models for user_sessions aggregate
- [x] Backfill job for historical events (2023–2025)

## In progress
- [ ] Schema migration for v2 event envelope format

## Next
- Add dead-letter queue for malformed events
- Build alerting for consumer lag > 5 minutes
- Upgrade Spark to 3.5
