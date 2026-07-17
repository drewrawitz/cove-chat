# `@cove/domain`

Pure domain values, invariants, and decisions for Cove.

The current interface uses Effect Schema for branded workspace, user, and channel identifiers; channel-name validation; and channel visibility. It also contains the pure decision that controls whether a workspace member may view a public or private channel.

The package depends on Effect v4 as its domain vocabulary. It has no transport, persistence, platform, or infrastructure dependencies.
