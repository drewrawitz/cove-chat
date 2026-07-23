export type TopicMessageKind = "opening brief" | "reply";

const topicMessageKindLabels = {
  "opening brief": "Opening brief",
  reply: "Reply",
} as const satisfies Record<TopicMessageKind, string>;

export const topicMessageKind = (position: number): TopicMessageKind =>
  position === 1 ? "opening brief" : "reply";

export const topicMessageKindLabel = (position: number): string =>
  topicMessageKindLabels[topicMessageKind(position)];
