/** @vitest-environment jsdom */

import { cleanup, render } from "@testing-library/react";
import { memo, type ReactElement } from "react";
import { afterEach, expect, test, vi } from "vite-plus/test";
import {
  AccountConversationStateProvider,
  useAccountConversationRuntime,
} from "./account-conversation-state-context.tsx";
import { createAccountConversationState } from "./account-conversation-state.ts";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

test("keeps the runtime context stable when provider inputs do not change", () => {
  window.localStorage.clear();
  const state = createAccountConversationState({
    accountId: "account-1",
    storage: window.localStorage,
    createBroadcastChannel: () => ({
      addEventListener: () => undefined,
      close: () => undefined,
      postMessage: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
  const repairZeroCache = vi.fn(async () => undefined);
  const restartZero = vi.fn();
  let consumerRenders = 0;
  const Consumer = memo(function Consumer(): ReactElement {
    useAccountConversationRuntime();
    consumerRenders += 1;
    return <p>Conversation runtime</p>;
  });
  const provider = () => (
    <AccountConversationStateProvider
      repairZeroCache={repairZeroCache}
      restartZero={restartZero}
      state={state}
    >
      <Consumer />
    </AccountConversationStateProvider>
  );

  const view = render(provider());
  view.rerender(provider());

  expect(consumerRenders).toBe(1);
  state.destroy();
});
