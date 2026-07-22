import { expect, it } from "vite-plus/test";
import { topicIntentFromFormValue, topicIntentLabel } from "./topic-intent.ts";

it("maps Topic Intent form values to their display labels", () => {
  expect(topicIntentFromFormValue("question")).toBe("question");
  expect(topicIntentLabel("question")).toBe("Question");
  expect(topicIntentFromFormValue("")).toBeUndefined();
  expect(topicIntentFromFormValue("announcement")).toBeUndefined();
});
