# Browser acceptance tests

This package owns browser journeys that cross Cove's public web and HTTP boundaries. The harness
starts an isolated PostgreSQL container, deploys migrations, loads the normal demo seed, launches
the API and web processes, and drives Chromium through Playwright. Tests therefore exercise the
same protocol, application, and persistence adapters as the running product.

Docker must be available. Install the browser runtime once, then run the suite:

```sh
vp run install:browsers
vp run test
```

Run those commands from `apps/acceptance`. Keep browser assertions focused on user-observable
outcomes; persistence invariants that remain after access is removed belong in the PostgreSQL
integration suite.

## Growth-readiness showcase

From the repository root, run the opt-in moderate fixture and single showcase journey with:

```sh
vp run growth:showcase
```

The command uses an isolated PostgreSQL container, loads the deterministic moderate seed, and
starts one API, web, Zero cache, and Chromium instance. It opens a second tab only for the shared
unresolved-command and sign-out checks. Before that journey, it runs repository checks, the normal
focused suites from the preceding growth-readiness slices, and the exact-shape moderate fixture
test. Ordinary `vp run test` excludes the moderate fixture and showcase journey.

During the recovery section, the harness stops only the Zero cache process it started, verifies
that `ZERO_REPLICA_FILE` is the expected regular file inside its temporary replica directory,
removes that one file, and restarts the same configured cache. PostgreSQL remains authoritative;
the Zero replica is persistent while running but disposable derived state and is not a backup.

The console ends with one content-free diagnostic object containing samples for cached render,
bounded cold Channel and Topic pages, pending appearance, HTTP commit, commit-to-visible,
reconnect convergence, synchronized row counts, browser-transferred bytes, repeated browser
storage usage, replica size, and rebuild duration. These values are directional local diagnostics,
not benchmark percentiles, service levels, production recovery claims, or blocking timing
thresholds. Deterministic correctness and the successful browser journey are the gate.

The directional comparison points are 200 ms for cached render, 2 s for a bounded cold page, 100 ms
for pending appearance, 1 s for an ordinary HTTP commit, 2 s for normal commit-to-visible
reconciliation, and 5 s for reconnect convergence. The command reports measurements but does not
fail on these approximate values.

The showcase intentionally composes the focused suites instead of repeating their invariants:

- PostgreSQL and Zero integration tests own row/request bounds, complete keyset pagination,
  authorization, and bounded query behavior.
- Message-command persistence, HTTP, and web tests own idempotent retries and conflicts, expected
  versions, terminal outcomes, and both reconciliation orders.
- Account conversation-state and Private Channel tests own reconnect guarding, selective cache
  repair, draft/command isolation, access loss, and Account-data removal.
- `growth-readiness-showcase.acceptance.test.ts` owns only the participant-visible cross-module
  journey and the local replica rebuild diagnostics.
