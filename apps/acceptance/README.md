# Browser acceptance tests

This package owns browser journeys that cross Cove's public web and HTTP boundaries. The harness
starts an isolated PostgreSQL container, deploys migrations, loads the normal demo seed, launches
the API and web processes, and drives Chromium through Playwright. Tests therefore exercise the
same protocol, application, and persistence adapters as the running product.

Docker must be available. Install the browser runtime once, then run the suite:

```sh
vp run install:browsers
vp test
```

Run those commands from `apps/acceptance`. Keep browser assertions focused on user-observable
outcomes; persistence invariants that remain after access is removed belong in the PostgreSQL
integration suite.
