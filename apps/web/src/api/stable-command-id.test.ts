import { describe, expect, it } from "vite-plus/test";
import { releaseCommandId, retainCommandId } from "./stable-command-id.ts";

describe("stable command identity", () => {
  it("reuses an identifier for the same input and rotates it when the input changes", () => {
    let sequence = 0;
    const makeCommandId = () => `command-${++sequence}`;

    const first = retainCommandId(undefined, "same-input", makeCommandId);
    const retry = retainCommandId(first, "same-input", makeCommandId);
    const changed = retainCommandId(retry, "changed-input", makeCommandId);

    expect(retry).toEqual(first);
    expect(changed.commandId).not.toBe(first.commandId);
  });

  it("clears only the command that completed", () => {
    const pending = retainCommandId(undefined, "same-input", () => "command-1");

    expect(releaseCommandId(pending, "another-command")).toEqual(pending);
    expect(releaseCommandId(pending, pending.commandId)).toBeUndefined();
  });
});
