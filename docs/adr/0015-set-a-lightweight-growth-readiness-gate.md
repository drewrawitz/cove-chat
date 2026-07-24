---
status: accepted
---

# Set a lightweight growth-readiness gate

Cove is an engineering showcase rather than a production-capacity claim, so its growth gate proves
the important invariants without maintaining a cloud resource ceiling or a large browser load lab.
A deterministic moderate fixture contains 20 Channels, 500 Topics in its busiest Channel, 10,000
Messages, and one Topic with 1,000 Replies. Fast integration tests prove query result bounds,
pagination without gaps or duplicates, authorization, idempotent retry and key conflicts, both
HTTP/Zero reconciliation orders, reconnect behavior, and Account-data removal. One real-browser
flow, including a second tab where needed, proves the visible pending states, deliberate pagination,
cache repair, access revocation, and sign-out behavior.

A lightweight local smoke script records cached render, cold page, HTTP commit, commit-to-visible,
and reconnect timings against a documented developer environment. It runs a few samples to catch
obvious regressions rather than claiming statistically meaningful percentiles or service-level
objectives. The expected showcase behavior remains: cached content feels immediate, bounded cold
pages complete within two seconds, pending content appears within 100 milliseconds, ordinary
commands commit within one second, committed rows normally reconcile within two seconds, and a
restored connection normally converges within five seconds. Timing output is diagnostic; the
blocking gate is deterministic correctness plus a successful browser smoke flow.

The showcase does not require a 100-client test, ten Chromium instances, a fixed production
resource footprint, or recurring million-Message rehearsals. A larger manual seed may be used when
investigating a real regression, but it is not a roadmap or release gate. CI guards against
unbounded Zero relationships and requires an explicit growth and privacy review when synchronized
tables, columns, or query shapes expand.

Measurements cover query rows and bytes, page latency, HTTP commit and commit-to-visible latency,
pending age, reconnect convergence, IndexedDB usage, replica size and rebuild duration, and
idempotency conflicts. Metrics and logs never contain Message text, drafts, authentication tokens,
or participant identifiers; high-cardinality IDs belong only in access-controlled diagnostic
traces when genuinely needed.
