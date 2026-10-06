# Implementation checkpoints

- Audit: completed initial source review and baseline lint/typecheck/domain tests. See security/AUDIT.md.
- Database: in progress — real local Supabase/Postgres, migrations and hostile-client/concurrency tests.
- Runtime/auth: next — separate immutable roles, memory-scoped cache and server mutations.
- Design: next — three destinations, simple request composer, responsive accessible controls.
- Payments/operations/release: next — provider test mode, durable recovery, CI and manual setup/cost guide.

Existing uncommitted SDK-compatible secure-store/crypto/file-system/Stripe dependencies and Supabase local config are retained as the starting workspace state. No other work is discarded.
