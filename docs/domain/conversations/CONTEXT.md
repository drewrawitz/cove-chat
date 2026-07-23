# Conversations

This context defines Cove's durable, topic-first communication model. Conversation is organized into bounded topics rather than an endless channel or direct-message stream.

## Containers

**Channel**:
A durable, named workspace context for a team, project, area, or social group. A channel contains topics and can be public or private.
_Avoid_: Message stream, room type

**Public Channel**:
A channel that every full member can discover and read. Guests access it only through explicit channel membership.

**General Channel**:
The Public Channel that every Workspace begins with. The Workspace creator is its initial Channel Maintainer and Channel Member.
_Avoid_: Mandatory channel, system channel

**Private Channel**:
A channel whose topics are accessible only to its channel members.

**Direct Space**:
A private conversation container for a fixed set of participants that contains the same kind of named topics as a channel. Adding a participant creates a new direct space rather than exposing existing history.
_Avoid_: Endless DM stream, group channel

## Topics

**Topic**:
A named, bounded asynchronous conversation inside a channel or direct space. The topic itself is the thread, and it inherits access from its container.
_Avoid_: Thread, top-level message

**Message**:
An authored entry in a topic, either its opening brief or a flat reply.
_Avoid_: Contribution, post

**Reply**:
A message added after the opening brief that responds to the topic as a whole. Replies cannot contain nested reply threads.
_Avoid_: Comment, nested reply

**Opening Brief**:
The first message in a topic, which establishes the subject and context for the conversation.
_Avoid_: Root message

**Topic Intent**:
An optional label such as question, proposal, decision, update, or discussion that describes what a topic is trying to accomplish without changing its underlying model.
_Avoid_: Topic type

**Resolution**:
A human-confirmed outcome that marks a topic resolved without locking it. A resolved topic can be reopened.
_Avoid_: Closed thread, AI summary

## Movement

**Move Proposal**:
A request to move an entire direct topic into a channel, naming the destination and requiring approval from every direct-space participant.
_Avoid_: Share request, automatic publication

**Topic Move**:
The atomic transfer of an approved topic and all its messages from a direct space to a channel. It changes the topic's audience without cloning the conversation.
_Avoid_: Copy, publish, cross-post

**Move Tombstone**:
The read-only record left in a direct space after a topic move, identifying the destination without retaining a second copy of the topic.
_Avoid_: Topic copy
