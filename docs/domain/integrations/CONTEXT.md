# Integrations

This context defines how external capabilities participate in Cove without replacing its topic model or bypassing workspace authority, conversation access, or attention choices.

## Language

**Plugin**:
A workspace-installed extension that can add commands, actions, structured messages, external records, or automations within explicitly granted capabilities.
_Avoid_: Unrestricted extension, built-in feature

**Plugin Installation**:
A workspace's approved use of a plugin and its capabilities. An owner or admin controls installation.
_Avoid_: User connection

**Plugin Authorization**:
An individual workspace identity's permission for an installed plugin to use an external account on that person's behalf.
_Avoid_: Plugin installation, workspace approval

**Plugin Command**:
An explicit user invocation of a plugin from within Cove, such as using `/meet` inside a topic.
_Avoid_: Automatic action

**Plugin Message**:
A structured topic message produced by a plugin and attributed to the workspace identity that invoked it.
_Avoid_: Bot message
