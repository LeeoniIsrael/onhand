# Security audit — 5 October 2026

Scope: all tracked routes, features, domain logic, state, service adapters, SQL migrations, payment handlers, app/build configuration and dependency graph. This is a code review and local validation, not a third-party penetration test or a claim that undiscovered issues cannot exist.

## Initial findings

| Severity | Finding | Required correction |
| --- | --- | --- |
| High | Every journey uses device-local demo state; supplying backend keys does not make it authoritative. | Replace runtime with authenticated PostgreSQL RPCs and scoped queries. |
| High | `profile_name` permits role changes because it restricts rows but not columns. | Immutable roles, signup trigger, column grants and validated profile RPC. |
| High | Worker licenses, skills and all review text are readable by every authenticated user. | Restrict raw tables; expose bounded participant-safe worker summaries. |
| High | Device AsyncStorage holds auth refresh tokens and all job/private address state. | Native keychain/keystore sessions; memory-only private data and account-scoped cache clearing. |
| High | No production dispatcher, credential revalidation or authenticated offer acceptance path. | Geospatial filtering, deterministic scoring, expiring waves, row locks, eligibility rechecks and unique active-worker constraint. |
| High | Payment handlers can leave Stripe/DB inconsistencies, omit refund/cancellation recovery and have no reconciliation queue. | Durable operations, stable idempotency keys, approval/version guards, signed events and retryable reconciliation. |
| Medium | No action rate limits, bounded pagination, account deletion or durable support reports. | DB transaction limits, bounded queries, deletion workflow and reports table. |
| Medium | Photo paths can be forged independently of ownership and storage metadata; arbitrary UUID casts can error. | Validate path/job membership and content limits; upload then register; safe storage policies. |
| Medium | Web session risks, unvalidated deep links, no release security headers or CI. | Password auth, HTTPS/CSP hosting requirements, verified session initialization and checks in CI. |
| Medium | Demo classification guesses Plumbing for unrelated text, potentially implying diagnosis. | Explicit category selection; no paid AI dependency or fake diagnosis. |

Baseline lint, strict TypeScript and 15 domain tests pass. Baseline dependency audit reports 32 findings (21 high, 11 moderate), many cascading from build tooling. Remediation and remaining release gates are recorded in the final validation report. Do not apply `npm audit fix --force`: its suggested Expo/RN downgrades break SDK compatibility.
