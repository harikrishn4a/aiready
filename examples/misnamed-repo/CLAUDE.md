# CLAUDE.md — analytics-pipeline

> **Example** — This repo uses CLAUDE.md instead of AGENTS.md. The LLM-powered audit correctly classifies it as an identity/constraints file despite the non-standard filename.

## What this is
A Python data pipeline that processes event streams and writes aggregated
metrics to a data warehouse. Version 0.9.0. Runs on Python 3.11+.

## Stack
- Python 3.11+
- Apache Kafka — event ingestion
- Apache Spark — batch and streaming processing
- Snowflake — data warehouse target
- dbt — transformation layer
- pytest — testing

## Constraints
- MUST NOT drop or truncate production Snowflake tables
- MUST NOT commit Kafka consumer credentials or Snowflake connection details
- MUST run `make test` before marking any feature complete
- MUST NOT modify dbt models without updating the corresponding documentation
