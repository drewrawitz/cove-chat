import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { browserAction, openConversations, signIn } from "../support/browser-actions.ts";
import { BrowserAcceptance, BrowserAcceptanceLive } from "../support/browser-acceptance.ts";

it.live(
  "starts, browses, and opens a named Channel Topic through inherited access",
  () =>
    Effect.gen(function* () {
      const acceptance = yield* BrowserAcceptance;
      const page = acceptance.page;

      yield* signIn(acceptance, "bob@cove.local");
      yield* openConversations(page);
      yield* browserAction(() => page.getByRole("button", { name: "Start a topic" }).click());
      const dialog = page.getByRole("dialog");
      yield* browserAction(() => dialog.getByRole("heading", { name: "Start a Topic" }).waitFor());
      yield* browserAction(() => page.getByLabel("Topic title").fill("Release readiness"));
      yield* browserAction(() =>
        page.getByLabel("Opening Brief").fill("Capture the remaining launch risks."),
      );
      yield* browserAction(() =>
        page.getByLabel("Topic Intent (optional)").selectOption("question"),
      );
      yield* browserAction(() => page.getByRole("button", { name: "Create topic" }).click());

      yield* browserAction(() =>
        page.getByRole("heading", { name: "Release readiness", level: 2 }).waitFor(),
      );
      yield* browserAction(() => page.getByText("Question", { exact: true }).waitFor());
      yield* browserAction(() => page.getByRole("heading", { name: "Opening Brief" }).waitFor());
      yield* browserAction(() =>
        page.getByText("Capture the remaining launch risks.", { exact: true }).waitFor(),
      );
      expect(new URL(page.url()).pathname).toMatch(
        /^\/workspaces\/demo-workspace\/channels\/general\/topics\/[^/]+$/,
      );

      yield* browserAction(() => page.getByRole("link", { name: "Back to General" }).click());
      const topicSummary = page.getByRole("link", { name: /Release readiness/ });
      yield* browserAction(() => topicSummary.waitFor());
      yield* browserAction(() => topicSummary.getByText("Question", { exact: true }).waitFor());
      expect(
        yield* browserAction(() =>
          page.getByRole("button", { name: /contribution|send/i }).count(),
        ),
      ).toBe(0);

      yield* browserAction(() => page.context().clearCookies());
      yield* signIn(acceptance, "alice@cove.local");
      yield* openConversations(page);
      expect(
        yield* browserAction(() => page.getByRole("button", { name: "Start a topic" }).count()),
      ).toBe(0);
      yield* browserAction(() => page.getByRole("link", { name: /Release readiness/ }).click());
      yield* browserAction(() =>
        page.getByRole("heading", { name: "Release readiness", level: 2 }).waitFor(),
      );
      yield* browserAction(() =>
        page.getByText("Capture the remaining launch risks.", { exact: true }).waitFor(),
      );
    }).pipe(Effect.provide(BrowserAcceptanceLive)),
  120_000,
);
