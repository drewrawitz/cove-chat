import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import type { Page } from "playwright";
import {
  BrowserAcceptance,
  BrowserAcceptanceLive,
  type BrowserAcceptanceService,
} from "../support/browser-acceptance.ts";

const browserAction = <A>(operation: () => Promise<A>) =>
  Effect.tryPromise({
    try: operation,
    catch: (cause) => new Error("Browser action failed.", { cause }),
  });

const waitForWorkspaceChooser = (page: Page) =>
  browserAction(() => page.getByRole("heading", { name: "Choose a workspace" }).waitFor());

const signIn = (acceptance: BrowserAcceptanceService, email: string) =>
  Effect.gen(function* () {
    const page = acceptance.page;
    yield* browserAction(() => page.goto(acceptance.webUrl));
    yield* browserAction(() => page.getByLabel("Email address").fill(email));
    yield* browserAction(() => page.getByRole("button", { name: "Send magic link" }).click());
    const magicLink = yield* acceptance.takeMagicLink();
    yield* browserAction(() => page.goto(magicLink));
    yield* waitForWorkspaceChooser(page);
  });

it.live(
  "creates, discovers, reads, and joins a Public Channel without disclosing it cross-Workspace",
  () =>
    Effect.gen(function* () {
      const acceptance = yield* BrowserAcceptance;
      const page = acceptance.page;

      yield* signIn(acceptance, "bob@cove.local");
      yield* browserAction(() => page.getByRole("link", { name: "Enter Cove Demo" }).click());
      yield* browserAction(() => page.getByLabel("Channel name").fill("product-lab"));
      yield* browserAction(() =>
        page
          .getByLabel("Purpose")
          .fill("A durable place to explore and steward product experiments."),
      );
      yield* browserAction(() =>
        page.getByLabel("Initial Channel Steward").selectOption({ label: "Bob in Cove" }),
      );
      yield* browserAction(() =>
        page.getByRole("button", { name: "Create Public Channel" }).click(),
      );
      yield* browserAction(() => page.getByRole("heading", { name: "#product-lab" }).waitFor());

      const channelId = new URL(page.url()).pathname.split("/").at(-1);
      expect(channelId).toBeDefined();
      yield* browserAction(() => page.context().clearCookies());
      yield* signIn(acceptance, "alice@cove.local");
      yield* browserAction(() => page.getByRole("link", { name: "Enter Cove Demo" }).click());

      const memberNavigation = page.getByRole("navigation", { name: "Your channels" });
      expect(
        yield* browserAction(() =>
          memberNavigation.getByRole("link", { name: "product-lab" }).count(),
        ),
      ).toBe(0);
      const discovery = page.getByRole("region", { name: "Discover public channels" });
      yield* browserAction(() => discovery.getByText("product-lab", { exact: true }).waitFor());
      yield* browserAction(() =>
        discovery
          .getByText("A durable place to explore and steward product experiments.")
          .waitFor(),
      );
      yield* browserAction(() => discovery.getByRole("link", { name: "Read product-lab" }).click());

      yield* browserAction(() => page.getByRole("heading", { name: "#product-lab" }).waitFor());
      yield* browserAction(() =>
        page.getByText("A durable place to explore and steward product experiments.").waitFor(),
      );
      yield* browserAction(() => page.getByText("Stewarded by Bob in Cove").waitFor());
      expect(
        yield* browserAction(() =>
          page
            .getByRole("navigation", { name: "Your channels" })
            .getByRole("link", { name: "product-lab" })
            .count(),
        ),
      ).toBe(0);

      yield* browserAction(() => page.getByRole("button", { name: "Join channel" }).click());
      yield* browserAction(() => page.getByText("You joined #product-lab.").waitFor());
      yield* browserAction(() =>
        page
          .getByRole("navigation", { name: "Your channels" })
          .getByRole("link", { name: "product-lab" })
          .waitFor(),
      );

      yield* browserAction(() => page.goto(acceptance.webUrl));
      yield* waitForWorkspaceChooser(page);
      yield* browserAction(() => page.getByLabel("Workspace name").fill("Elsewhere"));
      yield* browserAction(() => page.getByRole("button", { name: "Create workspace" }).click());
      yield* browserAction(() => page.getByRole("heading", { name: "Alice in Cove" }).waitFor());
      const otherWorkspaceId = new URL(page.url()).pathname.split("/").at(-1);
      expect(otherWorkspaceId).toBeDefined();

      yield* browserAction(() =>
        page.goto(`${acceptance.webUrl}/workspaces/${otherWorkspaceId}/channels/${channelId}`),
      );
      yield* browserAction(() =>
        page.getByText("This channel is not available in this workspace.").waitFor(),
      );
    }).pipe(Effect.provide(BrowserAcceptanceLive)),
  120_000,
);
