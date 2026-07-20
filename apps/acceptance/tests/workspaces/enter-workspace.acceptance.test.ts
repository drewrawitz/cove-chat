import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import type { Page } from "playwright";
import { BrowserAcceptance, BrowserAcceptanceLive } from "../support/browser-acceptance.ts";

const browserAction = <A>(operation: () => Promise<A>) =>
  Effect.tryPromise({
    try: operation,
    catch: (cause) => new Error("Browser action failed.", { cause }),
  });

const waitForWorkspaceChooser = (page: Page) =>
  browserAction(async () => {
    try {
      await page.getByRole("heading", { name: "Choose a workspace" }).waitFor();
    } catch (cause) {
      const body = await page.locator("body").innerText();
      throw new Error(`Workspace chooser did not load at ${page.url()}.\n${body}`, { cause });
    }
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
      yield* waitForWorkspaceChooser(page);
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
      yield* waitForWorkspaceChooser(page);

      expect(
        yield* browserAction(() => page.getByRole("link", { name: "Enter Cove Demo" }).count()),
      ).toBe(0);
    }).pipe(Effect.provide(BrowserAcceptanceLive)),
  120_000,
);

it.live(
  "creates and switches workspaces while keeping each workspace identity independent",
  () =>
    Effect.gen(function* () {
      const acceptance = yield* BrowserAcceptance;
      const page = acceptance.page;

      yield* browserAction(() => page.goto(acceptance.webUrl));
      yield* browserAction(() => page.getByLabel("Email address").fill("alice@cove.local"));
      yield* browserAction(() => page.getByRole("button", { name: "Send magic link" }).click());

      const magicLink = yield* acceptance.takeMagicLink();
      yield* browserAction(() => page.goto(magicLink));
      yield* waitForWorkspaceChooser(page);

      const identityName = page.getByLabel("Your name in this workspace");
      const avatarUrl = page.getByLabel("Avatar URL");
      expect(yield* browserAction(() => identityName.inputValue())).toBe("Alice in Cove");
      expect(yield* browserAction(() => avatarUrl.inputValue())).toBe("/avatars/alice.svg");

      yield* browserAction(() => page.getByLabel("Workspace name").fill("North Star"));
      yield* browserAction(() => identityName.fill("Alice North"));
      yield* browserAction(() => page.getByRole("button", { name: "Create workspace" }).click());
      yield* browserAction(() => page.getByRole("heading", { name: "Alice North" }).waitFor());

      const switcher = page.getByRole("navigation", { name: "Workspace switcher" });
      yield* browserAction(() =>
        switcher.getByRole("link", { name: "Cove Demo Member" }).waitFor(),
      );
      yield* browserAction(() =>
        switcher.getByRole("link", { name: "North Star Owner" }).waitFor(),
      );
      expect(yield* browserAction(() => switcher.getByText("Inbox").count())).toBe(0);

      yield* browserAction(() =>
        page.getByLabel("Your name in this workspace").fill("Alice North Updated"),
      );
      yield* browserAction(() =>
        page.getByRole("button", { name: "Save workspace identity" }).click(),
      );
      yield* browserAction(() =>
        page.getByRole("heading", { name: "Alice North Updated" }).waitFor(),
      );

      yield* browserAction(() => switcher.getByRole("link", { name: "Cove Demo Member" }).click());
      yield* browserAction(() => page.getByRole("heading", { name: "Alice in Cove" }).waitFor());
      expect(
        yield* browserAction(() =>
          page.getByRole("heading", { name: "Alice North Updated" }).count(),
        ),
      ).toBe(0);

      yield* browserAction(() => switcher.getByRole("link", { name: "North Star Owner" }).click());
      yield* browserAction(() =>
        page.getByRole("heading", { name: "Alice North Updated" }).waitFor(),
      );
    }).pipe(Effect.provide(BrowserAcceptanceLive)),
  120_000,
);

it.live(
  "invites a Full Member, accepts the invitation, and lets an Owner appoint an Admin",
  () =>
    Effect.gen(function* () {
      const acceptance = yield* BrowserAcceptance;
      const page = acceptance.page;

      const signIn = (email: string) =>
        Effect.gen(function* () {
          yield* browserAction(() => page.goto(acceptance.webUrl));
          yield* browserAction(() => page.getByLabel("Email address").fill(email));
          yield* browserAction(() => page.getByRole("button", { name: "Send magic link" }).click());
          const magicLink = yield* acceptance.takeMagicLink();
          yield* browserAction(() => page.goto(magicLink));
          yield* waitForWorkspaceChooser(page);
        });

      yield* signIn("bob@cove.local");
      yield* browserAction(() => page.getByRole("link", { name: "Enter Cove Demo" }).click());
      yield* browserAction(() => page.getByRole("heading", { name: "Bob in Cove" }).waitFor());
      yield* browserAction(() =>
        page.getByLabel("Account email to invite").fill("carol@cove.local"),
      );
      yield* browserAction(() => page.getByRole("button", { name: "Invite Member" }).click());
      yield* browserAction(() => page.getByText("Invitation sent to carol@cove.local.").waitFor());

      yield* browserAction(() => page.context().clearCookies());
      yield* signIn("carol@cove.local");
      yield* browserAction(() => page.getByLabel("Your name for Cove Demo").fill("Carol in Cove"));
      yield* browserAction(() =>
        page.getByRole("button", { name: "Accept invitation to Cove Demo" }).click(),
      );
      yield* browserAction(() => page.getByRole("heading", { name: "Carol in Cove" }).waitFor());

      yield* browserAction(() => page.context().clearCookies());
      yield* signIn("bob@cove.local");
      yield* browserAction(() => page.getByRole("link", { name: "Enter Cove Demo" }).click());
      yield* browserAction(() => page.getByRole("heading", { name: "Full Members" }).waitFor());
      yield* browserAction(() => page.getByLabel("Role for Carol in Cove").selectOption("admin"));
      yield* browserAction(() =>
        page.getByRole("button", { name: "Save role for Carol in Cove" }).click(),
      );
      yield* browserAction(() => page.getByText("Carol in Cove is now Admin.").waitFor());
    }).pipe(Effect.provide(BrowserAcceptanceLive)),
  120_000,
);
