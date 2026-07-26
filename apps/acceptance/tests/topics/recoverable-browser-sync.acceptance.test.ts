import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import type { Page } from "playwright";
import { browserAction, openConversations, signIn } from "../support/browser-actions.ts";
import { BrowserAcceptance, BrowserAcceptanceLive } from "../support/browser-acceptance.ts";

const messageRequestPattern = "**/api/app/v1/workspaces/*/channels/*/topics/*/messages";

const createTopic = (page: Page) =>
  Effect.gen(function* () {
    yield* browserAction(() => page.getByRole("button", { name: "Start a topic" }).click());
    yield* browserAction(() => page.getByLabel("Topic title").fill("Recoverable browser state"));
    yield* browserAction(() =>
      page.getByLabel("Opening Brief").fill("Verify that recoverable state converges across tabs."),
    );
    yield* browserAction(() => page.getByRole("button", { name: "Create topic" }).click());
    yield* browserAction(() =>
      page.getByRole("heading", { name: "Recoverable browser state", level: 2 }).waitFor(),
    );
  });

const messageList = (page: Page) => page.getByRole("list", { name: "Topic messages" });

it.live(
  "shares one pending overlay across tabs, sends once, and clears the account on sign-out",
  () =>
    Effect.gen(function* () {
      const acceptance = yield* BrowserAcceptance;
      const sourcePage = acceptance.page;

      yield* signIn(acceptance, "bob@cove.local");
      yield* openConversations(sourcePage);
      yield* createTopic(sourcePage);

      const observingPage = yield* browserAction(() => sourcePage.context().newPage());
      yield* browserAction(() => observingPage.goto(sourcePage.url()));
      yield* browserAction(() =>
        observingPage
          .getByRole("heading", { name: "Recoverable browser state", level: 2 })
          .waitFor(),
      );

      let releaseRequest: (() => void) | undefined;
      const requestGate = new Promise<void>((resolve) => {
        releaseRequest = resolve;
      });
      let messageRequestCount = 0;

      yield* browserAction(() =>
        sourcePage.route(messageRequestPattern, async (route) => {
          messageRequestCount += 1;
          await requestGate;
          await route.continue();
        }),
      );

      const reply = "Only the source tab sends this request.";
      yield* browserAction(() => sourcePage.keyboard.press("r"));
      yield* browserAction(() => sourcePage.getByLabel("Write a reply").fill(reply));
      yield* browserAction(() => sourcePage.getByRole("button", { name: "Post" }).click());

      yield* browserAction(() =>
        messageList(sourcePage).getByText(reply, { exact: true }).waitFor(),
      );
      yield* browserAction(() =>
        messageList(observingPage).getByText(reply, { exact: true }).waitFor(),
      );
      yield* browserAction(() =>
        messageList(sourcePage).getByText("Pending…", { exact: true }).waitFor(),
      );
      yield* browserAction(() =>
        messageList(observingPage).getByText("Pending…", { exact: true }).waitFor(),
      );

      expect(messageRequestCount).toBe(1);
      expect(
        yield* browserAction(() =>
          messageList(sourcePage).getByText(reply, { exact: true }).count(),
        ),
      ).toBe(1);
      expect(
        yield* browserAction(() =>
          messageList(observingPage).getByText(reply, { exact: true }).count(),
        ),
      ).toBe(1);

      yield* Effect.sync(() => releaseRequest?.());
      yield* browserAction(() => sourcePage.unroute(messageRequestPattern));
      yield* browserAction(() =>
        sourcePage.getByRole("button", { name: "Reply", exact: true }).waitFor(),
      );

      yield* browserAction(() =>
        sourcePage.getByLabel("Switch workspace, currently Cove Demo").click(),
      );
      const sourceAccount = sourcePage.getByRole("region", { name: "Account" });
      yield* browserAction(() =>
        sourceAccount.getByRole("button", { name: "Sign out of Cove" }).click(),
      );

      yield* browserAction(() => sourcePage.getByLabel("Email address").waitFor());
      yield* browserAction(() => observingPage.getByLabel("Email address").waitFor());

      const sourceKeys = yield* browserAction(() =>
        sourcePage.evaluate(() =>
          Object.keys(localStorage).filter((key) => key.startsWith("cove:account-conversation:")),
        ),
      );
      const observingKeys = yield* browserAction(() =>
        observingPage.evaluate(() =>
          Object.keys(localStorage).filter((key) => key.startsWith("cove:account-conversation:")),
        ),
      );
      expect(sourceKeys).toEqual([]);
      expect(observingKeys).toEqual([]);
    }).pipe(Effect.provide(BrowserAcceptanceLive)),
  120_000,
);
