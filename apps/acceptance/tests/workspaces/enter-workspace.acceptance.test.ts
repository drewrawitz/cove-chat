import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { randomUUID } from "node:crypto";
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
  browserAction(async () => {
    try {
      await page.getByRole("heading", { name: "Choose a workspace" }).waitFor();
    } catch (cause) {
      const body = await page.locator("body").innerText();
      throw new Error(`Workspace chooser did not load at ${page.url()}.\n${body}`, { cause });
    }
  });

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
  "signs in, enters a workspace as its workspace identity, and loses access after leaving",
  () =>
    Effect.gen(function* () {
      const acceptance = yield* BrowserAcceptance;
      const page = acceptance.page;

      yield* signIn(acceptance, "alice@cove.local");
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

      yield* signIn(acceptance, "alice@cove.local");

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
      const inviteeEmail = `new-member-${randomUUID()}@example.test`;

      yield* signIn(acceptance, "bob@cove.local");
      yield* browserAction(() => page.getByRole("link", { name: "Enter Cove Demo" }).click());
      yield* browserAction(() => page.getByRole("heading", { name: "Bob in Cove" }).waitFor());
      yield* browserAction(() => page.getByLabel("Email address to invite").fill(inviteeEmail));
      yield* browserAction(() => page.getByRole("button", { name: "Invite Member" }).click());
      yield* browserAction(() => page.getByText(`Invitation sent to ${inviteeEmail}.`).waitFor());
      const pendingInvitations = page.getByRole("region", { name: "Pending invitations" });
      yield* browserAction(() => pendingInvitations.getByText(inviteeEmail).waitFor());
      yield* browserAction(() => pendingInvitations.getByText("Sent", { exact: true }).waitFor());
      yield* browserAction(() =>
        pendingInvitations.getByText("Expires", { exact: true }).waitFor(),
      );
      const resendButton = page.getByRole("button", {
        name: `Resend invitation to ${inviteeEmail}`,
      });
      expect(yield* browserAction(() => resendButton.isDisabled())).toBe(true);
      expect(yield* browserAction(() => resendButton.textContent())).toMatch(/Resend in \d+s/);

      yield* acceptance.makeWorkspaceInvitationResendable(inviteeEmail);
      yield* browserAction(() => page.reload());
      yield* browserAction(() =>
        page.getByRole("button", { name: `Resend invitation to ${inviteeEmail}` }).click(),
      );
      yield* browserAction(() =>
        page
          .getByText(
            `Invitation email sent again to ${inviteeEmail}. Resend is available again in 60 seconds.`,
          )
          .waitFor(),
      );

      yield* acceptance.takeWorkspaceInvitationLink();
      const invitationLink = yield* acceptance.takeWorkspaceInvitationLink();
      yield* browserAction(() => page.context().clearCookies());
      yield* browserAction(() => page.goto(invitationLink));
      yield* browserAction(() => page.getByLabel("Your name").fill("New Member"));
      yield* browserAction(() =>
        page.getByRole("button", { name: "Create account and join workspace" }).click(),
      );
      yield* browserAction(() => page.getByRole("heading", { name: "New Member" }).waitFor());

      yield* browserAction(() => page.context().clearCookies());
      yield* signIn(acceptance, "bob@cove.local");
      yield* browserAction(() => page.getByRole("link", { name: "Enter Cove Demo" }).click());
      yield* browserAction(() => page.getByRole("heading", { name: "Full Members" }).waitFor());
      yield* browserAction(() => page.getByLabel("Role for New Member").selectOption("admin"));
      yield* browserAction(() =>
        page.getByRole("button", { name: "Save role for New Member" }).click(),
      );
      yield* browserAction(() => page.getByText("New Member is now Admin.").waitFor());

      const revokedEmail = `revoked-member-${randomUUID()}@example.test`;
      yield* browserAction(() => page.getByLabel("Email address to invite").fill(revokedEmail));
      yield* browserAction(() => page.getByRole("button", { name: "Invite Member" }).click());
      yield* browserAction(() => page.getByText(`Invitation sent to ${revokedEmail}.`).waitFor());
      yield* browserAction(() =>
        page.getByRole("button", { name: `Revoke invitation to ${revokedEmail}` }).click(),
      );
      yield* browserAction(() =>
        page.getByText(`Invitation to ${revokedEmail} revoked.`).waitFor(),
      );
      expect(
        yield* browserAction(() =>
          page.getByRole("button", { name: `Revoke invitation to ${revokedEmail}` }).count(),
        ),
      ).toBe(0);
    }).pipe(Effect.provide(BrowserAcceptanceLive)),
  120_000,
);

it.live(
  "removes a Member immediately and later restores the same Workspace Identity",
  () =>
    Effect.gen(function* () {
      const acceptance = yield* BrowserAcceptance;
      const page = acceptance.page;

      yield* signIn(acceptance, "alice@cove.local");
      yield* browserAction(() => page.getByRole("link", { name: "Enter Cove Demo" }).click());
      yield* browserAction(() => page.getByRole("heading", { name: "Alice in Cove" }).waitFor());
      yield* browserAction(() =>
        page.getByLabel("Your name in this workspace").fill("Alice Still in Cove"),
      );
      yield* browserAction(() =>
        page.getByRole("button", { name: "Save workspace identity" }).click(),
      );
      yield* browserAction(() =>
        page.getByRole("heading", { name: "Alice Still in Cove" }).waitFor(),
      );
      const aliceCookies = yield* browserAction(() => page.context().cookies());

      yield* browserAction(() => page.context().clearCookies());
      yield* signIn(acceptance, "bob@cove.local");
      yield* browserAction(() => page.getByRole("link", { name: "Enter Cove Demo" }).click());
      yield* browserAction(() => page.getByRole("heading", { name: "Full Members" }).waitFor());
      yield* browserAction(() =>
        page.getByRole("button", { name: "Remove Alice Still in Cove" }).click(),
      );
      yield* browserAction(() =>
        page.getByText("Alice Still in Cove's Membership ended.").waitFor(),
      );
      yield* browserAction(() =>
        page.getByLabel("Email address to invite").fill("alice@cove.local"),
      );
      yield* browserAction(() => page.getByRole("button", { name: "Invite Member" }).click());
      yield* browserAction(() => page.getByText("Invitation sent to alice@cove.local.").waitFor());

      yield* browserAction(() => page.context().clearCookies());
      yield* browserAction(() => page.context().addCookies(aliceCookies));
      yield* browserAction(() => page.goto(`${acceptance.webUrl}/workspaces/demo-workspace`));
      yield* browserAction(() =>
        page.getByText("This workspace is not available to your account.").waitFor(),
      );

      yield* browserAction(() => page.goto(acceptance.webUrl));
      yield* waitForWorkspaceChooser(page);
      expect(
        yield* browserAction(() => page.getByRole("link", { name: "Enter Cove Demo" }).count()),
      ).toBe(0);
      expect(yield* browserAction(() => page.getByLabel("Your name for Cove Demo").count())).toBe(
        0,
      );
      yield* browserAction(() =>
        page.getByRole("button", { name: "Accept invitation to Cove Demo" }).click(),
      );
      const restoredHeading = page.getByRole("heading", { name: "Alice Still in Cove" });
      yield* browserAction(() => restoredHeading.waitFor());
      expect(yield* browserAction(() => restoredHeading.textContent())).toBe("Alice Still in Cove");
      expect(
        yield* browserAction(() =>
          page.getByRole("img", { name: "Alice Still in Cove" }).getAttribute("src"),
        ),
      ).toBe("/avatars/alice.svg");
    }).pipe(Effect.provide(BrowserAcceptanceLive)),
  120_000,
);
