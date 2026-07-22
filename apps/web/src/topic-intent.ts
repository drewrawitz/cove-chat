export const topicIntentOptions = [
  { value: "question", label: "Question" },
  { value: "proposal", label: "Proposal" },
  { value: "decision", label: "Decision" },
  { value: "update", label: "Update" },
  { value: "discussion", label: "Discussion" },
] as const;

export type TopicIntent = (typeof topicIntentOptions)[number]["value"];

export function topicIntentFromFormValue(value: string): TopicIntent | undefined {
  return topicIntentOptions.find((option) => option.value === value)?.value;
}

export function topicIntentLabel(intent: TopicIntent): string {
  return topicIntentOptions.find((option) => option.value === intent)?.label ?? intent;
}
