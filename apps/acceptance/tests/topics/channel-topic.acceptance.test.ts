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
      yield* browserAction(() =>
        page.getByRole("heading", { name: "Bob in Cove", level: 3 }).waitFor(),
      );
      const openingBriefTime = page.locator("time").first();
      yield* browserAction(() => openingBriefTime.waitFor());
      yield* browserAction(() =>
        page
          .getByText(/^(now|\d+[mh])$/)
          .first()
          .waitFor(),
      );
      expect(yield* browserAction(() => openingBriefTime.getAttribute("title"))).toBeTruthy();
      expect(
        yield* browserAction(() => page.getByText("Opening Brief", { exact: true }).count()),
      ).toBe(0);
      yield* browserAction(() =>
        page.getByText("Capture the remaining launch risks.", { exact: true }).waitFor(),
      );
      yield* browserAction(() =>
        page
          .getByRole("button", { name: /More actions for opening brief by Bob in Cove:/ })
          .click(),
      );
      yield* browserAction(() =>
        page.getByRole("menuitem", { name: "Edit opening brief" }).click(),
      );
      yield* browserAction(() =>
        page
          .getByLabel("Edit opening brief")
          .fill("Capture the remaining launch risks and owners."),
      );
      yield* browserAction(() => page.getByRole("button", { name: "Save" }).click());
      yield* browserAction(() =>
        page.getByText("Capture the remaining launch risks and owners.", { exact: true }).waitFor(),
      );
      yield* browserAction(() => page.getByText("Edited", { exact: true }).waitFor());

      yield* browserAction(() => page.keyboard.press("r"));
      yield* browserAction(() =>
        page.getByLabel("Write a reply").fill("The release candidate passed smoke testing."),
      );
      yield* browserAction(() => page.keyboard.press("Meta+Enter"));
      yield* browserAction(() =>
        page.getByText("The release candidate passed smoke testing.", { exact: true }).waitFor(),
      );
      yield* browserAction(() =>
        page.getByRole("button", { name: /More actions for reply 1 by Bob in Cove:/ }).click(),
      );
      yield* browserAction(() => page.getByRole("menuitem", { name: "Delete reply" }).click());
      const deleteDialog = page.getByRole("dialog");
      yield* browserAction(() =>
        deleteDialog.getByRole("heading", { name: "Delete reply?" }).waitFor(),
      );
      yield* browserAction(() =>
        deleteDialog.getByRole("button", { name: "Delete reply" }).click(),
      );
      yield* browserAction(() => page.getByText("Reply deleted", { exact: true }).waitFor());
      expect(new URL(page.url()).pathname).toMatch(
        /^\/workspaces\/demo-workspace\/channels\/general\/topics\/[^/]+$/,
      );

      yield* browserAction(() => page.getByRole("link", { name: "Back to General" }).click());
      const topicSummary = page.getByRole("link", { name: /Release readiness/ });
      yield* browserAction(() => topicSummary.waitFor());
      yield* browserAction(() => topicSummary.getByText("Question", { exact: true }).waitFor());
      yield* browserAction(() => topicSummary.getByText("Bob in Cove", { exact: true }).waitFor());
      yield* browserAction(() =>
        topicSummary.getByText("Reply deleted", { exact: true }).waitFor(),
      );
      yield* browserAction(() => topicSummary.locator("time").waitFor());
      expect(
        yield* browserAction(() => page.getByRole("button", { name: /message|send/i }).count()),
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
        page.getByText("Capture the remaining launch risks and owners.", { exact: true }).waitFor(),
      );
      yield* browserAction(() => page.getByText("Edited", { exact: true }).waitFor());
      yield* browserAction(() => page.getByText("Reply deleted", { exact: true }).waitFor());
      expect(yield* browserAction(() => page.getByLabel("Write a reply").count())).toBe(0);
      expect(
        yield* browserAction(() => page.getByRole("button", { name: /^More actions for/ }).count()),
      ).toBe(0);
    }).pipe(Effect.provide(BrowserAcceptanceLive)),
  120_000,
);
