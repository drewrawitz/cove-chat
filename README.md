# Vite+ Monorepo Starter

A starter for creating a Vite+ monorepo.

## Development

- Check everything is ready:

```bash
vp run ready
```

- Run the tests:

```bash
vp run -r test
```

- Build the monorepo:

```bash
vp run -r build
```

- Run the development server:

```bash
vp run dev
```

Durable Topic updates also require the API, a PostgreSQL server configured with
`wal_level=logical`, and the Zero cache. See [`packages/sync/README.md`](packages/sync/README.md)
for the sync process and environment variables.
