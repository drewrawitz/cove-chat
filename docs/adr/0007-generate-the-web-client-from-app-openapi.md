---
status: accepted
---

# Generate the web client from app OpenAPI

`CoveAppApi` remains the source of truth for the first-party HTTP contract, from which Cove generates a deterministic OpenAPI 3.1 document and an Orval fetch/TanStack Query client for the web application. Orval also generates Zod response schemas so the browser decodes HTTP responses at runtime instead of trusting generated TypeScript types. This adds a checked code-generation step but keeps request functions, response types, query keys, hooks, and decoders synchronized while isolating browser-specific credentials, CSRF, and HTTP error handling behind one fetch adapter.

Effect Schema remains the contract and decoding vocabulary on the server. The generated Zod schemas are a browser-only projection of that same OpenAPI contract, chosen because Orval's fetch runtime-validation path supports Zod directly.
