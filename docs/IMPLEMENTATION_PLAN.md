# OnHand implementation checkpoints

1. Audit all tracked application, database and server files; record security findings and release boundaries.
2. Build a working PostgreSQL/PostGIS backend: immutable roles, private addresses, validated transactions, rate limits, idempotency, atomic assignment, server matching and background dispatch.
3. Connect real authentication and data. Use secure native session storage, account-scoped query caches, realtime invalidation, bounded pagination and reliable mutation feedback.
4. Replace the fragmented demo UI with separate customer and worker journeys. Customers describe a job and name a price. Workers configure their skills, receive suitable offers and manage work. Consolidate duplicate destinations.
5. Connect payment authorization/capture, reviews, messaging, safety reporting and account deletion without purchasing or enabling paid services.
6. Run application, database authorization/concurrency and browser checks; export native bundles; add CI and operating/release instructions. Push each verified checkpoint.

## Design direction

Use paper white (#F8FAFC), ink (#182334), slate (#526174), blue (#214DD8), pale blue (#EAF0FF) and restrained success green (#166645). Native system typography, large readable amounts, left aligned content, quiet separators and generous spacing. The job and its price carry the visual hierarchy. Three primary destinations per role; one main action per stage. Motion answers presses and state changes and respects reduced motion. No decorative dashboard metrics, fake people, invented verification or AI diagnosis.

## Delivery boundaries

Local services and tests are free. Hosted credentials, verified workers, payment provider setup, store developer accounts and device QA are external release gates. Build the paths and document the exact setup; never represent a simulated payment, verification, deployment or scale measurement as real. No purchases, billable cloud builds or paid AI calls are authorized.
