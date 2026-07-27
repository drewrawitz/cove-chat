# Synchronized growth and privacy review

PostgreSQL is Cove's source of truth, and Zero's persistent replica is disposable derived state.
The synchronized surface stays deliberately small so each participant receives only bounded,
currently authorized Conversation data.

The structural gate in `tests/growth-review.test.ts` records the reviewed tables, columns, named
queries, relationships, ordering, and maximum row counts. A deliberate change to any of those
surfaces must update that test and complete this checklist in the same review:

- [ ] Every named query has an explicit maximum row count, including `.one()` queries.
- [ ] Every related shape is bounded by cardinality or an explicit limit.
- [ ] Every synchronized table and column has a participant-visible need.
- [ ] Authorization remains independently enforced for every named query.
- [ ] Initial Channel and Topic reads remain bounded; complete history requires deliberate paging.
- [ ] Added query shapes cannot expose cached Private Channel content before fresh authorization.
- [ ] Added Account data is covered by sign-out and invalid-session removal.
- [ ] Query diagnostics remain content-free and low-cardinality: no Message or draft text, tokens,
      participant identifiers, or entity identifiers.
- [ ] The moderate fixture and browser showcase still exercise the changed shape.

This is an explicit engineering review, not permission to broaden synchronization for architectural
symmetry. Reads that do not require reactive synchronization remain on their existing HTTP owner.
