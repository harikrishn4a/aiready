> **Example** — The Template section shows the format; the Example section shows a filled entry. Generate new entries in this format as decisions are made.

# DECISIONS.md

Record every significant architectural or dependency decision here.
Agents read this before making choices that affect the project structure.

## Template

### YYYY-MM-DD: {{DECISION_TITLE}}
- **Decision**: What was decided
- **Reason**: Why this was chosen
- **Rejected alternatives**: What else was considered and why it was rejected
- **Constraints introduced**: Any new rules this decision creates
- **Revisit when**: Conditions under which this should be reconsidered

---

## Example

### 2026-01-15: Use Redis for session caching
- **Decision**: Cache user session data in Redis with 5-minute TTL
- **Reason**: High read frequency on every API call, small data size per session
- **Rejected alternatives**: PostgreSQL materialized view — too costly to maintain under high write frequency
- **Constraints introduced**: Cache must be actively invalidated on write; TTL alone is not sufficient
- **Revisit when**: Session data size grows beyond 10KB per user or write frequency drops significantly