import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import type { Page } from "playwright";
import { browserAction, openConversations, signIn } from "../support/browser-actions.ts";
import { BrowserAcceptance, BrowserAcceptanceLive } from "../support/browser-acceptance.ts";

const createPrivateChannel = (page: Page, name: string, purpose: string) =>
  Effect.gen(function* () {
    yield* browserAction(() => page.getByRole("button", { name: "New channel" }).click());
    const dialog = page.getByRole("dialog");
    yield* browserAction(() => dialog.getByLabel("Private").check());
    yield* browserAction(() => dialog.getByLabel("Channel name").fill(name));
    yield* browserAction(() => dialog.getByLabel("Purpose").fill(purpose));
    yield* browserAction(() => dialog.getByRole("button", { name: "Create channel" }).click());
    yield* browserAction(() => page.getByRole("heading", { name }).waitFor());
    yield* browserAction(() => page.getByText("Joined", { exact: true }).waitFor());
  });

it.live(
  "creates and administers a Private Channel without granting invisible content access",
  () =>
    Effect.gen(function* () {
      const acceptance = yield* BrowserAcceptance;
      const page = acceptance.page;

      yield* signIn(acceptance, "bob@cove.local");
      yield* openConversations(page);
      yield* createPrivateChannel(page, "Leadership", "Coordinate sensitive leadership work.");
      yield* browserAction(() =>
        page
          .getByRole("navigation", { name: "Your channels" })
          .getByRole("link", { name: "Leadership" })
          .waitFor(),
      );
      expect(
        yield* browserAction(() => page.getByRole("dialog", { name: "Manage members" }).count()),
      ).toBe(0);
      yield* browserAction(() =>
        page.getByRole("button", { name: "Manage channel members, 1 member" }).click(),
      );
      const channelMembers = page.getByRole("dialog", { name: "Manage members" });
      yield* browserAction(() => channelMembers.getByText("Bob in Cove").waitFor());
      yield* browserAction(() =>
        channelMembers.getByLabel("Member to add").selectOption({
          label: "Alice in Cove",
        }),
      );
      yield* browserAction(() =>
        channelMembers.getByRole("button", { name: "Add member" }).click(),
      );
      yield* browserAction(() => page.getByText("Alice in Cove joined Leadership.").waitFor());

      yield* browserAction(() => page.context().clearCookies());
      yield* signIn(acceptance, "alice@cove.local");
      yield* openConversations(page);
      yield* browserAction(() =>
        page
          .getByRole("navigation", { name: "Your channels" })
          .getByRole("link", { name: "Leadership" })
          .click(),
      );
      yield* browserAction(() => page.getByRole("heading", { name: "Leadership" }).waitFor());
      yield* browserAction(() => page.getByRole("button", { name: "Leave channel" }).click());
      const leaveDialog = page.getByRole("dialog", { name: "Leave Leadership?" });
      yield* browserAction(() =>
        leaveDialog.getByRole("button", { name: "Leave channel" }).click(),
      );
      yield* browserAction(() => page.waitForURL("**/workspaces/demo-workspace/channels/general"));
      yield* browserAction(() => page.getByRole("heading", { name: "General" }).waitFor());
      expect(
        yield* browserAction(() =>
          page
            .getByRole("navigation", { name: "Your channels" })
            .getByRole("link", { name: "Leadership" })
            .count(),
        ),
      ).toBe(0);
      yield* createPrivateChannel(page, "Project Zebra", "Coordinate a private project.");
      yield* browserAction(() =>
        page.getByRole("button", { name: "Manage channel members, 1 member" }).click(),
      );
      const projectMembers = page.getByRole("dialog", { name: "Manage members" });
      yield* browserAction(() =>
        projectMembers.getByLabel("Member to add").selectOption({
          label: "Carol in Cove",
        }),
      );
      yield* browserAction(() =>
        projectMembers.getByRole("button", { name: "Add member" }).click(),
      );
      yield* browserAction(() => page.getByText("Carol in Cove joined Project Zebra.").waitFor());
      yield* browserAction(() =>
        projectMembers.getByRole("button", { name: "Close member manager" }).click(),
      );
      yield* createPrivateChannel(page, "Compensation", "Discuss private compensation decisions.");
      const compensationChannelId = new URL(page.url()).pathname.split("/").at(-1);
      expect(compensationChannelId).toBeDefined();

      yield* browserAction(() => page.context().clearCookies());
      yield* signIn(acceptance, "bob@cove.local");
      yield* browserAction(() => page.getByRole("link", { name: "Enter Cove Demo" }).click());
      const administration = page.getByRole("region", {
        name: "Private Channel administration",
      });
      yield* browserAction(() => administration.getByText("Compensation").waitFor());
      const compensationAdministration = administration
        .getByRole("listitem")
        .filter({ hasText: "Compensation" });
      yield* browserAction(() =>
        compensationAdministration.getByLabel("Member to add to Compensation").selectOption({
          label: "Carol in Cove",
        }),
      );
      yield* browserAction(() =>
        compensationAdministration.getByRole("button", { name: "Add member" }).click(),
      );
      yield* browserAction(() => page.getByText("Carol in Cove joined Compensation.").waitFor());
      yield* browserAction(() =>
        page.goto(
          `${acceptance.webUrl}/workspaces/demo-workspace/channels/${compensationChannelId}`,
        ),
      );
      yield* browserAction(() =>
        page.getByText("This channel is not available in this workspace.").waitFor(),
      );
      yield* browserAction(() =>
        page.getByRole("link", { name: "Return to workspace management" }).click(),
      );
      yield* browserAction(() =>
        administration.getByRole("button", { name: "Join Compensation" }).click(),
      );
      yield* browserAction(() => page.getByText("You joined Compensation.").waitFor());
      yield* browserAction(() =>
        administration.getByRole("link", { name: "Open Compensation" }).click(),
      );
      yield* browserAction(() => page.getByRole("heading", { name: "Compensation" }).waitFor());
    }).pipe(Effect.provide(BrowserAcceptanceLive)),
  120_000,
);
