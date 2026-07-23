import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { browserAction, openConversations, signIn } from "../support/browser-actions.ts";
import { BrowserAcceptance, BrowserAcceptanceLive } from "../support/browser-acceptance.ts";

it.live(
  "synchronizes committed Topic changes across sessions and converges after reconnect",
  () =>
    Effect.gen(function* () {
      const acceptance = yield* BrowserAcceptance;
      const aliceContext = yield* browserAction(() => acceptance.browser.newContext());
      const alicePage = yield* browserAction(() => aliceContext.newPage());
      const aliceAcceptance = { ...acceptance, page: alicePage };

      yield* signIn(aliceAcceptance, "alice@cove.local");
      yield* openConversations(alicePage);
      yield* signIn(acceptance, "bob@cove.local");
      yield* openConversations(acceptance.page);

      yield* browserAction(() =>
        acceptance.page.getByRole("button", { name: "Start a topic" }).click(),
      );
      yield* browserAction(() =>
        acceptance.page.getByLabel("Topic title").fill("Live launch readiness"),
      );
      yield* browserAction(() =>
        acceptance.page
          .getByLabel("Opening Brief")
          .fill("Track the launch checks as they complete."),
      );
      yield* browserAction(() =>
        acceptance.page.getByRole("button", { name: "Create topic" }).click(),
      );

      const synchronizedTopic = alicePage.getByRole("link", { name: /Live launch readiness/ });
      yield* browserAction(() => synchronizedTopic.waitFor());
      expect(yield* browserAction(() => synchronizedTopic.count())).toBe(1);

      yield* browserAction(() => synchronizedTopic.click());
      yield* browserAction(() =>
        alicePage.getByRole("heading", { name: "Live launch readiness", level: 2 }).waitFor(),
      );
      yield* browserAction(() =>
        alicePage.getByText("Track the launch checks as they complete.", { exact: true }).waitFor(),
      );

      yield* browserAction(() => aliceContext.setOffline(true));

      yield* browserAction(() =>
        acceptance.page
          .getByRole("button", { name: /More actions for opening brief by Bob in Cove:/ })
          .click(),
      );
      yield* browserAction(() =>
        acceptance.page.getByRole("menuitem", { name: "Edit opening brief" }).click(),
      );
      yield* browserAction(() =>
        acceptance.page
          .getByLabel("Edit opening brief")
          .fill("Track the completed launch checks and their owners."),
      );
      yield* browserAction(() => acceptance.page.getByRole("button", { name: "Save" }).click());
      yield* browserAction(() =>
        acceptance.page
          .getByText("Track the completed launch checks and their owners.", { exact: true })
          .waitFor(),
      );

      yield* browserAction(() => acceptance.page.keyboard.press("r"));
      yield* browserAction(() =>
        acceptance.page
          .getByLabel("Write a reply")
          .fill("The release candidate passed smoke testing."),
      );
      yield* browserAction(() => acceptance.page.getByRole("button", { name: "Post" }).click());
      yield* browserAction(() =>
        acceptance.page
          .getByText("The release candidate passed smoke testing.", { exact: true })
          .waitFor(),
      );

      yield* browserAction(() => acceptance.page.keyboard.press("r"));
      yield* browserAction(() =>
        acceptance.page
          .getByLabel("Write a reply")
          .fill("The rollback rehearsal completed successfully."),
      );
      yield* browserAction(() => acceptance.page.getByRole("button", { name: "Post" }).click());
      yield* browserAction(() =>
        acceptance.page
          .getByText("The rollback rehearsal completed successfully.", { exact: true })
          .waitFor(),
      );

      yield* browserAction(() => aliceContext.setOffline(false));

      const editedOpeningBrief = alicePage.getByText(
        "Track the completed launch checks and their owners.",
        { exact: true },
      );
      const synchronizedFirstReply = alicePage.getByText(
        "The release candidate passed smoke testing.",
        { exact: true },
      );
      const synchronizedSecondReply = alicePage.getByText(
        "The rollback rehearsal completed successfully.",
        { exact: true },
      );
      yield* browserAction(() => editedOpeningBrief.waitFor());
      yield* browserAction(() => synchronizedFirstReply.waitFor());
      yield* browserAction(() => synchronizedSecondReply.waitFor());

      expect(yield* browserAction(() => editedOpeningBrief.count())).toBe(1);
      expect(yield* browserAction(() => synchronizedFirstReply.count())).toBe(1);
      expect(yield* browserAction(() => synchronizedSecondReply.count())).toBe(1);
      expect(
        yield* browserAction(() =>
          alicePage.getByRole("list", { name: "Topic messages" }).locator(":scope > li").count(),
        ),
      ).toBe(3);
    }).pipe(Effect.provide(BrowserAcceptanceLive)),
  120_000,
);
