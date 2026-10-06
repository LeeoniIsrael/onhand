# Security audit — 6 October 2026

Scope: repository routes, runtime/domain/state/services, SQL migrations, Auth/Storage/Realtime boundaries, payment/onboarding/media/operations handlers, build configuration, dependency graph and high-confidence credential patterns in tracked files/history. This is code review and local adversarial validation, not a third-party penetration test or a guarantee that no vulnerabilities remain.

## Findings and remediation

| Finding | Why it mattered | Implemented control |
| --- | --- | --- |
| Runtime used a local demo database | A phone could fabricate assignments and financial progress; backend keys did not make it authoritative. | Real PostgreSQL RPCs, scoped reads and server-managed payment state. |
| Role/profile grants permitted escalation | Row restrictions alone did not prevent role-column edits. | Immutable signup roles, column grants and validated commands. |
| Broad worker credential/review access | Other users could read private license/review data. | Raw-table revocations and bounded participant-safe summaries. |
| Precise offer distance/score leakage | Metre distances and invertible score explanations could narrow a private address. | Kilometre/five-minute buckets; revoke sensitive offer columns, including Realtime. |
| Plaintext device tokens/private cache | Local storage held refresh tokens and private marketplace state. | Native secure byte-chunked storage; memory-only private queries; legacy cleanup and account cache isolation. |
| Cross-tab Auth broadcasts | A login in one tab could replace another tab's account. | Per-document Auth channel with tab-scoped persisted session keys. |
| Deleted/revoked JWT access | Signature/expiry alone could allow an old token after logout/deletion. | Auth-session-row and active-profile checks in RLS, commands, reads and user Edge endpoints. Offline server logout still depends on connectivity/expiry. |
| Missing dispatcher/concurrency protection | Bursts could duplicate offers or assign one worker twice. | PostGIS filtering, bounded waves/slots, locks, eligibility rechecks and active-worker uniqueness. |
| Jurisdiction label trusted without geography | A user could label out-of-region coordinates with a valid license region. | Approved private jurisdiction polygons, spatial admission checks and current-time credential revalidation. |
| Payout readiness not part of availability | Workers could receive work without a usable connected account. | Availability/eligibility guard; payout-disable events expire pending offers. |
| Financial provider/database drift | Retries/cancellation/refunds could leave inconsistent charge/earnings states. | Durable operation IDs, signed authoritative events, approval/version/amount guards, reconciliation and audited full refunds. |
| Forged/unbounded photo uploads | Paths could be attached without owned files; direct upload paths bypassed limits. | Authenticated bounded upload endpoint, header/dimension/hash validation, serialized actor/job reservations, storage-object confirmation and denied client/signed uploads. |
| Deletion race/orphaned service uploads | Concurrent posting and orphan files could survive removal unexpectedly. | Actor locks, immediate access revocation/redaction, reservation-aware erasure queue and grace period for in-flight upload cleanup. |
| Unbounded reads/operations and missing support tools | Histories and bursts could grow without controlled work or recovery. | Keyset pagination/indexes, successful-command limits, bounded queues, provider batching, reports and audited operator tools. |
| Unsafe query decoder/toolchain defaults | Malformed URLs could hang decoding; version-forced audit fixes broke Expo. | Compatible patched decoder plus deterministic CommonJS adapter and regression tests; compatible uuid override. |

## Dependency audit

Initial scan: **32 findings (21 high, 11 moderate)**. Final `npm audit` on 6 October 2026: **21 high, zero moderate/critical**, cascading through Expo/Metro/build tools from two advisory sources:

- `braces`: stack exhaustion with deeply nested patterns, [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
- `node-forge`: RSA signature verification accepts extra nested algorithm elements, [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv).

The audit offers a downgrade to Expo SDK 44 rather than a compatible fix. It was not applied. These are unresolved toolchain risks, not a clean security bill. Review compatible upstream fixes, avoid untrusted build inputs and restrict signing/build access before public release. The malformed-URI decoder issue is patched and covered by a time-bounded regression. CI uses the tested lockfile and postinstall adapter; revisit it on upgrades.

A high-confidence pattern scan found no private-key blocks, Stripe secret-key patterns, GitHub tokens or AWS access keys in tracked files or 346 historical objects. It does not scan every secret format, entropy or ignored user files. Local environment files are ignored; fixture passwords/local tokens are deliberately non-production. No real server/payment keys were supplied.

## Remaining boundaries and launch controls

- Configure hosted Auth/SMTP, HTTPS/CSP, secrets, CORS, provider webhooks, cron, access controls, alerts, backups and budgets; local TOML is not hosted configuration.
- DB command limits count successful transactions; failed transactions roll counters back. Media limits bound reserved uploads, not every invalid ingress/CPU attempt. Add provider/ingress limits, timeouts and observability for abusive requests; per-process push pacing is not a global quota.
- Signed photo URLs remain usable until five-minute expiry, and backups have their own retention. Header validation is not complete decoding or antivirus scanning. Clients warn against putting addresses/phone numbers in job descriptions; there is no automated text moderation.
- Service credentials are powerful operator credentials. Keep them outside the client and tracked files; use audited tools, restricted operators and rotation. No automated government-ID/background check or insurance-expiry verification is included.
- Full live/test Stripe provider flows, APNs/FCM and signed physical-device tests remain unverified. Web/native exports prove bundling only.
- Handle safety reports, refunds/disputes, retention and credential reviews operationally. Evaluate marketplace fairness/quality using real outcomes and jurisdiction requirements.

See `docs/VALIDATION.md` for observed evidence and `docs/HANDOFF.md` for the numbered launch gates. Do not launch solely because lint/tests pass.
