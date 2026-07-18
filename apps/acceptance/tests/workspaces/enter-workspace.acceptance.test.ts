import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { BrowserAcceptance, BrowserAcceptanceLive } from "../support/browser-acceptance.ts";

const browserAction = <A>(operation: () => Promise<A>) =>
  Effect.tryPromise({
    try: operation,
    catch: (cause) => new Error("Browser action failed.", { cause }),
  });

it.live(
  "signs in, enters a workspace as its workspace identity, and loses access after leaving",
  () =>
    Effect.gen(function* () {
      const acceptance = yield* BrowserAcceptance;
      const page = acceptance.page;

      yield* browserAction(() => page.goto(acceptance.webUrl));
      yield* browserAction(() => page.getByLabel("Email address").fill("alice@cove.local"));
      yield* browserAction(() => page.getByRole("button", { name: "Send magic link" }).click());

      const magicLink = yield* acceptance.takeMagicLink();
      yield* browserAction(() => page.goto(magicLink));
      yield* browserAction(() =>
        page.getByRole("heading", { name: "Choose a workspace" }).waitFor(),
      );
      yield* browserAction(() => page.getByRole("link", { name: "Enter Cove Demo" }).click());

      const identityHeading = page.getByRole("heading", { name: "Alice in Cove" });
      const avatar = page.getByRole("img", { name: "Alice in Cove" });
      yield* browserAction(() => identityHeading.waitFor());
      yield* browserAction(() => avatar.waitFor());

      expect(yield* browserAction(() => identityHeading.textContent())).toBe("Alice in Cove");
      expect(yield* browserAction(() => avatar.getAttribute("src"))).toBe("/avatars/alice.svg");

      yield* browserAction(() => page.getByRole("button", { name: "Leave workspace" }).click());
      yield* browserAction(() => page.getByText("Your access to Cove Demo has ended.").waitFor());
      yield* browserAction(() => page.reload());
      yield* browserAction(() =>
        page.getByRole("heading", { name: "Choose a workspace" }).waitFor(),
      );

      expect(
        yield* browserAction(() => page.getByRole("link", { name: "Enter Cove Demo" }).count()),
      ).toBe(0);
    }).pipe(Effect.provide(BrowserAcceptanceLive)),
  120_000,
);
