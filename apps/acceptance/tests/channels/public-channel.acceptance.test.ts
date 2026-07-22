import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import {
  browserAction,
  openConversations,
  signIn,
  waitForWorkspaceChooser,
} from "../support/browser-actions.ts";
import { BrowserAcceptance, BrowserAcceptanceLive } from "../support/browser-acceptance.ts";

it.live(
  "creates, discovers, reads, and joins a Public Channel without disclosing it cross-Workspace",
  () =>
    Effect.gen(function* () {
      const acceptance = yield* BrowserAcceptance;
      const page = acceptance.page;

      yield* signIn(acceptance, "bob@cove.local");
      yield* openConversations(page);
      yield* browserAction(() => page.getByRole("button", { name: "New channel" }).click());
      const createDialog = page.getByRole("dialog");
      yield* browserAction(() =>
        createDialog.getByRole("heading", { name: "Create a new channel" }).waitFor(),
      );
      yield* browserAction(() => page.getByLabel("Channel name").fill("Product Lab"));
      yield* browserAction(() =>
        page
          .getByLabel("Purpose")
          .fill("A durable place to explore and maintain product experiments."),
      );
      yield* browserAction(() => page.getByRole("button", { name: "Create channel" }).click());
      yield* browserAction(() => page.getByRole("heading", { name: "Product Lab" }).waitFor());
      yield* browserAction(() => page.getByText("Joined", { exact: true }).waitFor());
      yield* browserAction(() =>
        page
          .getByRole("navigation", { name: "Your channels" })
          .getByRole("link", { name: "Product Lab" })
          .waitFor(),
      );

      const channelId = new URL(page.url()).pathname.split("/").at(-1);
      expect(channelId).toBeDefined();
      yield* browserAction(() => page.context().clearCookies());
      yield* signIn(acceptance, "alice@cove.local");
      yield* openConversations(page);

      const memberNavigation = page.getByRole("navigation", { name: "Your channels" });
      expect(
        yield* browserAction(() =>
          memberNavigation.getByRole("link", { name: "Product Lab" }).count(),
        ),
      ).toBe(0);
      const discovery = page.getByRole("region", { name: "Discover public channels" });
      yield* browserAction(() => discovery.getByText("Product Lab", { exact: true }).waitFor());
      expect(
        yield* browserAction(() =>
          discovery
            .getByText("A durable place to explore and maintain product experiments.")
            .count(),
        ),
      ).toBe(0);
      const channelRequestPattern = `**/api/app/v1/workspaces/demo-workspace/channels/${channelId}`;
      yield* browserAction(() =>
        page.route(channelRequestPattern, async (route) => {
          await new Promise((resolve) => setTimeout(resolve, 750));
          await route.continue();
        }),
      );
      yield* browserAction(() => discovery.getByRole("link", { name: "Product Lab" }).click());
      yield* browserAction(() => page.getByRole("status", { name: "Opening channel…" }).waitFor());
      expect(yield* browserAction(() => page.getByRole("complementary").count())).toBe(1);
      expect(yield* browserAction(() => page.locator("main.dark").count())).toBe(1);

      yield* browserAction(() => page.getByRole("heading", { name: "Product Lab" }).waitFor());
      yield* browserAction(() => page.unroute(channelRequestPattern));
      yield* browserAction(() =>
        page.getByText("A durable place to explore and maintain product experiments.").waitFor(),
      );
      yield* browserAction(() => page.getByText("Maintained by Bob in Cove").waitFor());
      expect(
        yield* browserAction(() =>
          page
            .getByRole("navigation", { name: "Your channels" })
            .getByRole("link", { name: "Product Lab" })
            .count(),
        ),
      ).toBe(0);

      yield* browserAction(() => page.getByRole("button", { name: "Join channel" }).click());
      yield* browserAction(() => page.getByText("You joined Product Lab.").waitFor());
      yield* browserAction(() =>
        page
          .getByRole("navigation", { name: "Your channels" })
          .getByRole("link", { name: "Product Lab" })
          .waitFor(),
      );

      yield* browserAction(() => page.goto(acceptance.webUrl));
      yield* waitForWorkspaceChooser(page);
      yield* browserAction(() => page.getByLabel("Workspace name").fill("Elsewhere"));
      yield* browserAction(() => page.getByRole("button", { name: "Create workspace" }).click());
      yield* browserAction(() => page.getByRole("heading", { name: "Alice in Cove" }).waitFor());
      const otherWorkspaceId = new URL(page.url()).pathname.split("/").at(-1);
      expect(otherWorkspaceId).toBeDefined();
      yield* browserAction(() => page.getByRole("link", { name: "Open conversations" }).click());
      yield* browserAction(() => page.getByRole("heading", { name: "General" }).waitFor());
      yield* browserAction(() => page.getByText("Maintained by Alice in Cove").waitFor());

      yield* browserAction(() => page.locator("summary").filter({ hasText: "Elsewhere" }).click());
      yield* browserAction(() =>
        Promise.all([
          page.waitForURL("**/workspaces/demo-workspace/channels/general"),
          page.getByRole("link", { name: "Switch to Cove Demo" }).click(),
        ]),
      );
      yield* browserAction(() => page.locator("summary").filter({ hasText: "Cove Demo" }).click());
      yield* browserAction(() =>
        Promise.all([
          page.waitForURL(`**/workspaces/${otherWorkspaceId}/channels/general`),
          page.getByRole("link", { name: "Switch to Elsewhere" }).click(),
        ]),
      );

      yield* browserAction(() =>
        page.goto(`${acceptance.webUrl}/workspaces/${otherWorkspaceId}/channels/${channelId}`),
      );
      yield* browserAction(() =>
        page.getByText("This channel is not available in this workspace.").waitFor(),
      );
    }).pipe(Effect.provide(BrowserAcceptanceLive)),
  120_000,
);
