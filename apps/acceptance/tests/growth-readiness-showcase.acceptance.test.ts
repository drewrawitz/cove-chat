import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { Buffer } from "node:buffer";
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
const repairDraft = "Draft preserved during selective repair.";

const elapsedSince = (startedAt: number): number => Math.max(0, performance.now() - startedAt);

const messageList = (page: Page) => page.getByRole("list", { name: "Topic messages" });
const topicRows = (page: Page) => page.locator("section[aria-labelledby='topics-heading'] ol > li");

interface GrowthReadinessDiagnostics {
  boundedColdChannelMs: number;
  boundedColdTopicMs: number;
  browserIndexedDbSamplesBytes: ReadonlyArray<number>;
  cachedRenderMs: number;
  channelRowsExpanded: number;
  channelRowsInitial: number;
  commitToVisibleMs: number;
  httpCommitMs: number;
  pendingAgeAtHttpCommitMs: number;
  pendingAppearanceMs: number;
  reconnectConvergenceMs: number;
  replicaBytes: number;
  replicaRebuildMs: number;
  topicRowsExpanded: number;
  topicRowsInitial: number;
  zeroQueryBytesReceived: number;
}

const controllableGate = () => {
  let release = (): void => undefined;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
};

const readBrowserIndexedDbUsage = (page: Page) =>
  browserAction(() =>
    page.evaluate(async () => {
      const estimate = await (
        navigator as Navigator & {
          readonly storage: {
            estimate: () => Promise<{
              usage?: number;
              usageDetails?: { indexedDB?: number };
            }>;
          };
        }
      ).storage.estimate();
      return estimate.usageDetails?.indexedDB ?? estimate.usage ?? 0;
    }),
  );

it.live(
  "passes the lightweight growth-readiness showcase gate",
  () =>
    Effect.gen(function* () {
      const acceptance = yield* BrowserAcceptance;
      const sourcePage = acceptance.page;
      const browserStorageSamples: Array<number> = [];
      const diagnostics: GrowthReadinessDiagnostics = {
        boundedColdChannelMs: Number.NaN,
        boundedColdTopicMs: Number.NaN,
        browserIndexedDbSamplesBytes: browserStorageSamples,
        cachedRenderMs: Number.NaN,
        channelRowsExpanded: Number.NaN,
        channelRowsInitial: Number.NaN,
        commitToVisibleMs: Number.NaN,
        httpCommitMs: Number.NaN,
        pendingAgeAtHttpCommitMs: Number.NaN,
        pendingAppearanceMs: Number.NaN,
        reconnectConvergenceMs: Number.NaN,
        replicaBytes: Number.NaN,
        replicaRebuildMs: Number.NaN,
        topicRowsExpanded: Number.NaN,
        topicRowsInitial: Number.NaN,
        zeroQueryBytesReceived: Number.NaN,
      };
      let zeroQueryBytesReceived = 0;
      const zeroHost = new URL(acceptance.zeroUrl).host;
      sourcePage.on("websocket", (socket) => {
        if (new URL(socket.url()).host !== zeroHost) return;
        socket.on("framereceived", ({ payload }) => {
          zeroQueryBytesReceived +=
            typeof payload === "string" ? Buffer.byteLength(payload) : payload.byteLength;
        });
      });

      yield* browserAction(() => sourcePage.clock.install());
      yield* signIn(acceptance, "bob@cove.local");
      const coldChannelStartedAt = performance.now();
      yield* openConversations(sourcePage);
      yield* browserAction(() => sourcePage.getByText("50 open", { exact: true }).waitFor());
      diagnostics.boundedColdChannelMs = elapsedSince(coldChannelStartedAt);
      diagnostics.channelRowsInitial = yield* browserAction(() => topicRows(sourcePage).count());
      expect(diagnostics.channelRowsInitial).toBe(50);
      browserStorageSamples.push(yield* readBrowserIndexedDbUsage(sourcePage));

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
      browserStorageSamples.push(yield* readBrowserIndexedDbUsage(sourcePage));

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

      const requestGate = controllableGate();
      const requestFinished = controllableGate();
      const browserContext = sourcePage.context();
      yield* browserAction(() =>
        browserContext.route(messageRequestPattern, async (route) => {
          await requestGate.promise;
          await route.continue();
          requestFinished.release();
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

      const replica = yield* acceptance.stopAndRemoveZeroReplica();
      diagnostics.replicaBytes = replica.replicaBytes;
      yield* browserAction(() =>
        sourcePage
          .getByText(/Reconnecting durable updates…|Durable updates are offline\./)
          .waitFor(),
      );

      const httpCommitStartedAt = performance.now();
      yield* Effect.sync(requestGate.release);
      yield* browserAction(() => requestFinished.promise);
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

      yield* browserAction(() => sourcePage.keyboard.press("r"));
      yield* browserAction(() => sourcePage.getByLabel("Write a reply").fill(repairDraft));
      yield* browserAction(async () => {
        const repairButton = sourcePage.getByRole("button", {
          name: "Repair synchronization",
        });
        for (let attempt = 0; attempt < 3; attempt += 1) {
          await sourcePage.clock.runFor(31_000);
          if (await repairButton.isVisible()) {
            await repairButton.press("Enter");
            return;
          }
        }
        throw new Error("Synchronization repair did not become available.");
      });
      yield* browserAction(() => sourcePage.keyboard.press("r"));
      expect(yield* browserAction(() => sourcePage.getByLabel("Write a reply").inputValue())).toBe(
        repairDraft,
      );
      yield* browserAction(() =>
        messageList(sourcePage).getByText(recoveryReply, { exact: true }).waitFor(),
      );
      yield* browserAction(() =>
        messageList(sourcePage).getByText("Syncing…", { exact: true }).waitFor(),
      );

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
      yield* browserAction(() =>
        messageList(sourcePage).getByText(recoveryReply, { exact: true }).waitFor(),
      );
      yield* browserAction(() =>
        messageList(observingPage).getByText(recoveryReply, { exact: true }).waitFor(),
      );
      diagnostics.commitToVisibleMs = elapsedSince(httpCommittedAt);
      diagnostics.reconnectConvergenceMs = elapsedSince(reconnectStartedAt);
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
      const privateAccessGate = controllableGate();
      const privateAccessFinished = controllableGate();
      const privateAccessPattern = `**/api/app/v1/workspaces/demo-workspace/channels/${privateChannelId}`;
      yield* browserAction(() =>
        sourcePage.route(privateAccessPattern, async (route) => {
          await privateAccessGate.promise;
          await route.continue();
          privateAccessFinished.release();
        }),
      );
      yield* browserAction(() => sourcePage.goto(privateTopicUrl));
      yield* browserAction(() =>
        sourcePage
          .getByText(/^(Opening Topic…|Confirming access before opening this Private Channel…)$/)
          .waitFor(),
      );
      expect(
        yield* browserAction(() =>
          sourcePage.getByText(privateOpeningBrief, { exact: true }).count(),
        ),
      ).toBe(0);
      yield* Effect.sync(privateAccessGate.release);
      yield* browserAction(() => privateAccessFinished.promise);
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

      browserStorageSamples.push(yield* readBrowserIndexedDbUsage(sourcePage));
      diagnostics.zeroQueryBytesReceived = zeroQueryBytesReceived;
      expect(diagnostics.zeroQueryBytesReceived).toBeGreaterThan(0);
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
      yield* browserAction(() => sourcePage.reload());
      yield* browserAction(() => sourcePage.getByLabel("Email address").waitFor());
    }).pipe(Effect.provide(GrowthReadinessBrowserAcceptanceLive)),
  180_000,
);
