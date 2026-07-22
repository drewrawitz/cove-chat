import { Effect } from "effect";
import type { Page } from "playwright";
import type { BrowserAcceptanceService } from "./browser-acceptance.ts";

export const browserAction = <A>(operation: () => Promise<A>) =>
  Effect.tryPromise({
    try: operation,
    catch: (cause) => new Error("Browser action failed.", { cause }),
  });

export const waitForWorkspaceChooser = (page: Page) =>
  browserAction(() => page.getByRole("heading", { name: "Choose a workspace" }).waitFor());

export const signIn = (acceptance: BrowserAcceptanceService, email: string) =>
  Effect.gen(function* () {
    const page = acceptance.page;
    yield* browserAction(() => page.goto(acceptance.webUrl));
    yield* browserAction(() => page.getByLabel("Email address").fill(email));
    yield* browserAction(() => page.getByRole("button", { name: "Send magic link" }).click());
    const magicLink = yield* acceptance.takeMagicLink();
    yield* browserAction(() => page.goto(magicLink));
    yield* waitForWorkspaceChooser(page);
  });

export const openConversations = (page: Page) =>
  Effect.gen(function* () {
    yield* browserAction(() => page.getByRole("link", { name: "Enter Cove Demo" }).click());
    yield* browserAction(() => page.getByRole("link", { name: "Open conversations" }).click());
    yield* browserAction(() => page.getByRole("heading", { name: "General" }).waitFor());
  });
