import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import type { Page } from "playwright";
import { browserAction, openConversations, signIn } from "./support/browser-actions.ts";
import {
  BrowserAcceptance,
  GrowthReadinessBrowserAcceptanceLive,
} from "./support/browser-acceptance.ts";

const messageRequestPattern = "**/api/app/v1/workspaces/*/channels/*/topics/*/messages";
const privateChannelId = "moderate-channel-01";
const privateChannelName = "Showcase Private";
const privateTopicTitle = "Private showcase recovery";
const privateOpeningBrief = "Fresh authorization protects this cached Private Channel.";
const recoveryReply = "Accepted by PostgreSQL while synchronization is unavailable.";

const elapsedSince = (startedAt: number): number => Math.max(0, performance.now() - startedAt);

const messageList = (page: Page) => page.getByRole("list", { name: "Topic messages" });
const topicRows = (page: Page) => page.locator("section[aria-labelledby='topics-heading'] ol > li");

const readBrowserStorageUsage = (page: Page) =>
  browserAction(() =>
    page.evaluate(async () => {
      const estimate = await (
        navigator as Navigator & {
          readonly storage: { estimate: () => Promise<{ usage?: number }> };
        }
      ).storage.estimate();
      return estimate.usage ?? 0;
    }),
  );

const ageAcceptedCommandForRepair = (page: Page) =>
  browserAction(() =>
    page.evaluate(() => {
      const commandKey = Object.keys(localStorage).find((key) => key.endsWith(":commands"));
      if (commandKey === undefined) throw new Error("No unresolved command journal was found.");
      const envelope = JSON.parse(localStorage.getItem(commandKey) ?? "null") as {
        commands?: Array<{ acceptedAt?: string }>;
      };
      if (envelope.commands?.length !== 1) {
        throw new Error("Expected exactly one unresolved command.");
      }
      envelope.commands[0]!.acceptedAt = new Date(Date.now() - 31_000).toISOString();
      localStorage.setItem(commandKey, JSON.stringify(envelope));

      const accountId = localStorage.getItem("cove:account-conversation:active-account");
      if (accountId === null) throw new Error("No active Account marker was found.");
      const broadcast = new BroadcastChannel(
        `cove:account-conversation:${encodeURIComponent(accountId)}`,
      );
      broadcast.postMessage({ type: "state-changed" });
      broadcast.close();
    }),
  );

it.live(
  "passes the lightweight growth-readiness showcase gate",
  () =>
    Effect.gen(function* () {
      const acceptance = yield* BrowserAcceptance;
      const sourcePage = acceptance.page;
      const diagnostics: Record<string, number | ReadonlyArray<number>> = {};
      const browserStorageSamples: Array<number> = [];

      yield* signIn(acceptance, "bob@cove.local");
      const coldChannelStartedAt = performance.now();
      yield* openConversations(sourcePage);
      yield* browserAction(() => sourcePage.getByText("50 open", { exact: true }).waitFor());
      diagnostics.boundedColdChannelMs = elapsedSince(coldChannelStartedAt);
      diagnostics.channelRowsInitial = yield* browserAction(() => topicRows(sourcePage).count());
      expect(diagnostics.channelRowsInitial).toBe(50);
      browserStorageSamples.push(yield* readBrowserStorageUsage(sourcePage));

      yield* browserAction(() =>
        sourcePage.getByRole("button", { name: "Load older Topics" }).click(),
      );
      yield* browserAction(() => sourcePage.getByText("100 open", { exact: true }).waitFor());
      diagnostics.channelRowsExpanded = yield* browserAction(() => topicRows(sourcePage).count());
      expect(diagnostics.channelRowsExpanded).toBe(100);

      const coldTopicStartedAt = performance.now();
      yield* browserAction(() =>
        sourcePage.getByRole("link", { name: /Growth Topic 0001/ }).click(),
      );
      yield* browserAction(() =>
        sourcePage.getByRole("heading", { name: "Growth Topic 0001", level: 2 }).waitFor(),
      );
      yield* browserAction(() =>
        sourcePage.getByText("900 older Replies remain.", { exact: true }).waitFor(),
      );
      diagnostics.topicRowsInitial = yield* browserAction(() =>
        messageList(sourcePage).locator("article").count(),
      );
      expect(diagnostics.topicRowsInitial).toBe(101);
      diagnostics.boundedColdTopicMs = elapsedSince(coldTopicStartedAt);

      yield* browserAction(() =>
        sourcePage.getByRole("button", { name: "Load older Replies" }).click(),
      );
      yield* browserAction(() =>
        sourcePage.getByText("800 older Replies remain.", { exact: true }).waitFor(),
      );
      diagnostics.topicRowsExpanded = yield* browserAction(() =>
        messageList(sourcePage).locator("article").count(),
      );
      expect(diagnostics.topicRowsExpanded).toBe(201);
      browserStorageSamples.push(yield* readBrowserStorageUsage(sourcePage));

      yield* browserAction(() => sourcePage.getByRole("link", { name: "Back to General" }).click());
      const cachedRenderStartedAt = performance.now();
      yield* browserAction(() =>
        sourcePage.getByRole("link", { name: /Growth Topic 0001/ }).click(),
      );
      yield* browserAction(() =>
        sourcePage.getByRole("heading", { name: "Growth Topic 0001", level: 2 }).waitFor(),
      );
      diagnostics.cachedRenderMs = elapsedSince(cachedRenderStartedAt);

      const observingPage = yield* browserAction(() => sourcePage.context().newPage());
      yield* browserAction(() => observingPage.goto(sourcePage.url()));
      yield* browserAction(() =>
        observingPage.getByRole("heading", { name: "Growth Topic 0001", level: 2 }).waitFor(),
      );

      let releaseRequest: (() => void) | undefined;
      const requestGate = new Promise<void>((resolve) => {
        releaseRequest = resolve;
      });
      let messageRequestCount = 0;
      const browserContext = sourcePage.context();
      yield* browserAction(() =>
        browserContext.route(messageRequestPattern, async (route) => {
          messageRequestCount += 1;
          await requestGate;
          await route.continue();
        }),
      );

      yield* browserAction(() => sourcePage.keyboard.press("r"));
      yield* browserAction(() => sourcePage.getByLabel("Write a reply").fill(recoveryReply));
      const pendingStartedAt = performance.now();
      yield* browserAction(() => sourcePage.getByRole("button", { name: "Post" }).click());
      yield* browserAction(() =>
        messageList(sourcePage).getByText("Pending…", { exact: true }).waitFor(),
      );
      yield* browserAction(() =>
        messageList(observingPage).getByText("Pending…", { exact: true }).waitFor(),
      );
      diagnostics.pendingAppearanceMs = elapsedSince(pendingStartedAt);
      expect(messageRequestCount).toBe(1);

      const replica = yield* acceptance.stopAndRemoveZeroReplica();
      diagnostics.replicaBytes = replica.replicaBytes;
      yield* browserAction(() =>
        sourcePage
          .getByText(/Reconnecting durable updates…|Durable updates are offline\./)
          .waitFor(),
      );

      const httpCommitStartedAt = performance.now();
      yield* Effect.sync(() => releaseRequest?.());
      yield* browserAction(() => browserContext.unroute(messageRequestPattern));
      yield* browserAction(() =>
        messageList(sourcePage).getByText("Syncing…", { exact: true }).waitFor(),
      );
      yield* browserAction(() =>
        messageList(observingPage).getByText("Syncing…", { exact: true }).waitFor(),
      );
      diagnostics.httpCommitMs = elapsedSince(httpCommitStartedAt);
      diagnostics.pendingAgeAtHttpCommitMs = elapsedSince(pendingStartedAt);
      const httpCommittedAt = performance.now();
      expect(messageRequestCount).toBe(1);

      yield* browserAction(() => sourcePage.keyboard.press("r"));
      yield* browserAction(() =>
        sourcePage.getByLabel("Write a reply").fill("Draft preserved during selective repair."),
      );
      yield* ageAcceptedCommandForRepair(sourcePage);
      yield* browserAction(() =>
        sourcePage.getByRole("button", { name: "Repair synchronization" }).click(),
      );
      const preservedState = yield* browserAction(() =>
        sourcePage.evaluate(() => {
          const values = Object.fromEntries(
            Object.keys(localStorage)
              .filter((key) => key.startsWith("cove:account-conversation:"))
              .map((key) => [key, localStorage.getItem(key)]),
          );
          return {
            hasCommand: Object.entries(values).some(
              ([key, value]) =>
                key.endsWith(":commands") &&
                (JSON.parse(value ?? "null") as { commands?: unknown[] }).commands?.length === 1,
            ),
            hasDraft: Object.entries(values).some(
              ([key, value]) =>
                key.endsWith(":drafts") &&
                (JSON.parse(value ?? "null") as { drafts?: unknown[] }).drafts?.length === 1,
            ),
          };
        }),
      );
      expect(preservedState).toEqual({ hasCommand: true, hasDraft: true });
      expect(messageRequestCount).toBe(1);

      const reconnectStartedAt = performance.now();
      const rebuild = yield* acceptance.restartZero();
      diagnostics.replicaRebuildMs = rebuild.rebuildMs;
      yield* browserAction(() =>
        messageList(sourcePage).getByText("Syncing…", { exact: true }).waitFor({
          state: "detached",
        }),
      );
      yield* browserAction(() =>
        messageList(observingPage).getByText("Syncing…", { exact: true }).waitFor({
          state: "detached",
        }),
      );
      diagnostics.commitToVisibleMs = elapsedSince(httpCommittedAt);
      diagnostics.reconnectConvergenceMs = elapsedSince(reconnectStartedAt);
      expect(messageRequestCount).toBe(1);
      expect(
        yield* browserAction(() =>
          messageList(sourcePage).getByText(recoveryReply, { exact: true }).count(),
        ),
      ).toBe(1);

      yield* browserAction(() =>
        sourcePage.goto(
          `${acceptance.webUrl}/workspaces/demo-workspace/channels/${privateChannelId}`,
        ),
      );
      yield* browserAction(() =>
        sourcePage.getByRole("heading", { name: privateChannelName, level: 2 }).waitFor(),
      );
      yield* browserAction(() => sourcePage.getByRole("button", { name: "Start a topic" }).click());
      yield* browserAction(() => sourcePage.getByLabel("Topic title").fill(privateTopicTitle));
      yield* browserAction(() => sourcePage.getByLabel("Opening Brief").fill(privateOpeningBrief));
      yield* browserAction(() => sourcePage.getByRole("button", { name: "Create topic" }).click());
      yield* browserAction(() =>
        sourcePage.getByRole("heading", { name: privateTopicTitle, level: 2 }).waitFor(),
      );
      const privateTopicUrl = sourcePage.url();

      yield* browserAction(() =>
        sourcePage.getByRole("link", { name: `Back to ${privateChannelName}` }).click(),
      );
      yield* browserAction(() =>
        sourcePage.getByRole("button", { name: /Manage channel members/ }).click(),
      );
      const memberDialog = sourcePage.getByRole("dialog", { name: "Manage members" });
      yield* browserAction(() =>
        memberDialog.getByLabel("Member to add").selectOption({ label: "Alice in Cove" }),
      );
      yield* browserAction(() => memberDialog.getByRole("button", { name: "Add member" }).click());
      yield* browserAction(() =>
        sourcePage.getByText(`Alice in Cove joined ${privateChannelName}.`).waitFor(),
      );
      yield* browserAction(() =>
        memberDialog.getByRole("button", { name: "Close member manager" }).click(),
      );

      yield* browserAction(() =>
        sourcePage.getByLabel("Switch workspace, currently Cove Demo").click(),
      );
      yield* browserAction(() =>
        sourcePage
          .getByRole("region", { name: "Account" })
          .getByRole("button", { name: "Sign out of Cove" })
          .click(),
      );
      yield* browserAction(() => sourcePage.getByLabel("Email address").waitFor());
      yield* browserAction(() => observingPage.getByLabel("Email address").waitFor());

      yield* signIn(acceptance, "alice@cove.local");
      yield* openConversations(sourcePage);
      yield* browserAction(() =>
        sourcePage
          .getByRole("navigation", { name: "Your channels" })
          .getByRole("link", { name: privateChannelName })
          .click(),
      );
      yield* browserAction(() =>
        sourcePage.getByRole("heading", { name: privateChannelName, level: 2 }).waitFor(),
      );
      yield* browserAction(() =>
        sourcePage.getByRole("link", { name: new RegExp(privateTopicTitle) }).click(),
      );
      yield* browserAction(() =>
        sourcePage.getByRole("heading", { name: privateTopicTitle, level: 2 }).waitFor(),
      );
      yield* browserAction(() =>
        sourcePage.getByText(privateOpeningBrief, { exact: true }).waitFor(),
      );

      yield* browserAction(() =>
        sourcePage.getByRole("link", { name: `Back to ${privateChannelName}` }).click(),
      );
      let releasePrivateAccess: (() => void) | undefined;
      const privateAccessGate = new Promise<void>((resolve) => {
        releasePrivateAccess = resolve;
      });
      const privateAccessPattern = `**/api/app/v1/workspaces/demo-workspace/channels/${privateChannelId}`;
      yield* browserAction(() =>
        sourcePage.route(privateAccessPattern, async (route) => {
          await privateAccessGate;
          await route.continue();
        }),
      );
      yield* browserAction(() => sourcePage.goto(privateTopicUrl));
      yield* browserAction(() =>
        sourcePage
          .getByText("Confirming access before opening this Private Channel…", { exact: true })
          .waitFor(),
      );
      expect(
        yield* browserAction(() =>
          sourcePage.getByText(privateOpeningBrief, { exact: true }).count(),
        ),
      ).toBe(0);
      yield* Effect.sync(() => releasePrivateAccess?.());
      yield* browserAction(() => sourcePage.unroute(privateAccessPattern));
      yield* browserAction(() =>
        sourcePage.getByText(privateOpeningBrief, { exact: true }).waitFor(),
      );

      yield* browserAction(() => sourcePage.keyboard.press("r"));
      yield* browserAction(() =>
        sourcePage.getByLabel("Write a reply").fill("Private draft removed after revocation."),
      );
      yield* browserAction(() =>
        sourcePage.getByRole("link", { name: `Back to ${privateChannelName}` }).click(),
      );
      yield* browserAction(() => sourcePage.getByRole("button", { name: "Leave channel" }).click());
      yield* browserAction(() =>
        sourcePage
          .getByRole("dialog", { name: `Leave ${privateChannelName}?` })
          .getByRole("button", { name: "Leave channel" })
          .click(),
      );
      yield* browserAction(() => sourcePage.getByRole("heading", { name: "General" }).waitFor());
      expect(
        yield* browserAction(() =>
          sourcePage
            .getByRole("navigation", { name: "Your channels" })
            .getByRole("link", { name: privateChannelName })
            .count(),
        ),
      ).toBe(0);

      browserStorageSamples.push(yield* readBrowserStorageUsage(sourcePage));
      diagnostics.browserStorageSamplesBytes = browserStorageSamples;
      diagnostics.browserTransferredBytes = yield* browserAction(() =>
        sourcePage.evaluate(() =>
          performance
            .getEntriesByType("resource")
            .reduce(
              (total, entry) => total + ((entry as { transferSize?: number }).transferSize ?? 0),
              0,
            ),
        ),
      );
      expect(
        Object.values(diagnostics)
          .flatMap((value) => (typeof value === "number" ? [value] : value))
          .every(Number.isFinite),
      ).toBe(true);
      console.log(`[growth-readiness] ${JSON.stringify(diagnostics)}`);

      yield* browserAction(() =>
        sourcePage.getByLabel("Switch workspace, currently Cove Demo").click(),
      );
      yield* browserAction(() =>
        sourcePage
          .getByRole("region", { name: "Account" })
          .getByRole("button", { name: "Sign out of Cove" })
          .click(),
      );
      yield* browserAction(() => sourcePage.getByLabel("Email address").waitFor());
      expect(
        yield* browserAction(() =>
          sourcePage.evaluate(() =>
            Object.keys(localStorage).filter((key) => key.startsWith("cove:account-conversation:")),
          ),
        ),
      ).toEqual([]);
    }).pipe(Effect.provide(GrowthReadinessBrowserAcceptanceLive)),
  180_000,
);
