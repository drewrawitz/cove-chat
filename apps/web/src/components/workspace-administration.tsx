import { Button } from "@cove/ui/components/button";
import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactElement, useEffect, useState } from "react";
import { CoveApiError } from "../api/cove-fetch.ts";
import {
  getWorkspacesGetWorkspaceQueryKey,
  invalidateWorkspacesListWorkspaces,
  useWorkspacesChangeWorkspaceRole,
  useWorkspacesInviteWorkspaceMember,
  useWorkspacesListFullMembers,
  useWorkspacesListPendingWorkspaceInvitations,
  useWorkspacesRemoveFullMember,
  useWorkspacesResendWorkspaceInvitation,
  useWorkspacesRevokeWorkspaceInvitation,
} from "../api/generated/cove-app.ts";
import { requiredFormValue, roleLabel } from "../form-data.ts";

interface WorkspaceAdministrationProps {
  readonly actorIsOwner: boolean;
  readonly currentIdentityId: string;
  readonly workspaceId: string;
}

interface FullMemberReference {
  readonly identity: {
    readonly id: string;
    readonly name: string;
  };
}

interface PendingInvitationReference {
  readonly id: string;
  readonly inviteeEmail: string;
  readonly invitedAt: string;
  readonly expiresAt: string;
  readonly resendAvailableAt: string;
}

interface InvitationToast {
  readonly kind: "error" | "success";
  readonly message: string;
}

type FullMemberRole = "admin" | "member" | "owner";

const invitationDateFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
});

export function WorkspaceAdministration({
  actorIsOwner,
  currentIdentityId,
  workspaceId,
}: WorkspaceAdministrationProps): ReactElement {
  const queryClient = useQueryClient();
  const members = useWorkspacesListFullMembers(workspaceId, { query: { retry: false } });
  const pendingInvitations = useWorkspacesListPendingWorkspaceInvitations(workspaceId, {
    query: { retry: false },
  });
  const inviteMember = useWorkspacesInviteWorkspaceMember();
  const resendInvitation = useWorkspacesResendWorkspaceInvitation();
  const revokeInvitation = useWorkspacesRevokeWorkspaceInvitation();
  const changeRole = useWorkspacesChangeWorkspaceRole();
  const removeFullMember = useWorkspacesRemoveFullMember();
  const [invitedEmail, setInvitedEmail] = useState<string>();
  const [administrationMessage, setAdministrationMessage] = useState<string>();
  const [invitationToast, setInvitationToast] = useState<InvitationToast>();
  const [resendingInvitationId, setResendingInvitationId] = useState<string>();

  useEffect(() => {
    if (invitationToast === undefined) return;

    const timeoutId = window.setTimeout(() => setInvitationToast(undefined), 5_000);
    return () => window.clearTimeout(timeoutId);
  }, [invitationToast]);

  const invite = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const email = requiredFormValue(form, "inviteeEmail");
    setInvitedEmail(undefined);
    inviteMember.mutate(
      { workspaceId, data: { email } },
      {
        onSuccess: async () => {
          formElement.reset();
          await pendingInvitations.refetch();
          setInvitedEmail(email);
        },
      },
    );
  };

  const refreshMemberships = async (): Promise<void> => {
    await Promise.all([
      members.refetch(),
      queryClient.invalidateQueries({
        queryKey: getWorkspacesGetWorkspaceQueryKey(workspaceId),
      }),
      invalidateWorkspacesListWorkspaces(queryClient),
    ]);
  };

  const saveRole = (event: FormEvent<HTMLFormElement>, member: FullMemberReference): void => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const role = requiredFormValue(form, "role");
    if (!isFullMemberRole(role)) return;
    setAdministrationMessage(undefined);
    changeRole.mutate(
      {
        workspaceId,
        workspaceIdentityId: member.identity.id,
        data: { role },
      },
      {
        onSuccess: async () => {
          await refreshMemberships();
          setAdministrationMessage(`${member.identity.name} is now ${roleLabel(role)}.`);
        },
      },
    );
  };

  const remove = (member: FullMemberReference): void => {
    setAdministrationMessage(undefined);
    removeFullMember.mutate(
      { workspaceId, workspaceIdentityId: member.identity.id },
      {
        onSuccess: async () => {
          await refreshMemberships();
          setAdministrationMessage(`${member.identity.name}'s Membership ended.`);
        },
      },
    );
  };

  const resend = (invitationId: string, inviteeEmail: string): void => {
    setInvitationToast(undefined);
    setResendingInvitationId(invitationId);
    resendInvitation.mutate(
      { workspaceId, invitationId },
      {
        onSuccess: async () => {
          setInvitationToast({
            kind: "success",
            message: `Invitation email sent again to ${inviteeEmail}. Resend is available again in 60 seconds.`,
          });
          await pendingInvitations.refetch();
        },
        onError: async (error) => {
          setInvitationToast({ kind: "error", message: resendInvitationErrorMessage(error) });
          await pendingInvitations.refetch();
        },
        onSettled: () => setResendingInvitationId(undefined),
      },
    );
  };

  const revoke = (invitationId: string, inviteeEmail: string): void => {
    setAdministrationMessage(undefined);
    revokeInvitation.mutate(
      { workspaceId, invitationId },
      {
        onSuccess: async () => {
          await pendingInvitations.refetch();
          setAdministrationMessage(`Invitation to ${inviteeEmail} revoked.`);
        },
      },
    );
  };

  return (
    <section className="mt-10 border-t pt-6">
      <h2 className="font-heading text-xl font-semibold">Workspace administration</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Invite anyone by email as a Member and deliberately assign Workspace Roles. Owners alone can
        appoint another Owner.
      </p>

      <h3 className="mt-8 font-heading text-lg font-semibold">Invite a member</h3>
      <form className="mt-4 flex flex-col gap-3 sm:flex-row" onSubmit={invite}>
        <label className="min-w-0 flex-1 text-sm font-medium">
          Email address to invite
          <input
            name="inviteeEmail"
            type="email"
            required
            className="mt-2 h-11 w-full rounded-xl border bg-background px-3 font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            placeholder="member@example.com"
          />
        </label>
        <div className="self-end">
          <Button type="submit" disabled={inviteMember.isPending}>
            {inviteMember.isPending ? "Inviting…" : "Invite Member"}
          </Button>
        </div>
      </form>
      {invitedEmail === undefined ? null : (
        <p className="mt-3 text-sm text-muted-foreground" role="status">
          Invitation sent to {invitedEmail}.
        </p>
      )}
      {inviteMember.error === null ? null : (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {invitationErrorMessage(inviteMember.error)}
        </p>
      )}

      <PendingInvitationsSection
        invitations={pendingInvitations.data?.invitations}
        isError={pendingInvitations.isError}
        isPending={pendingInvitations.isPending}
        isMutating={resendInvitation.isPending || revokeInvitation.isPending}
        resendingInvitationId={resendingInvitationId}
        onResend={resend}
        onRevoke={revoke}
      />

      <h3 className="mt-8 border-t pt-6 font-heading text-lg font-semibold">Full Members</h3>

      {members.isPending ? (
        <p className="mt-4 text-sm text-muted-foreground" role="status">
          Loading Full Members…
        </p>
      ) : members.isError ? (
        <p className="mt-4 text-sm text-destructive" role="alert">
          Cove could not load this Workspace's Full Members.
        </p>
      ) : (
        <ul className="mt-4 grid gap-3">
          {members.data.members.map((member) => {
            const isCurrentIdentity = member.identity.id === currentIdentityId;
            const canManageMember = actorIsOwner || member.membership.role !== "owner";

            return (
              <li className="rounded-2xl border p-5" key={member.identity.id}>
                <form className="grid gap-5" onSubmit={(event) => saveRole(event, member)}>
                  <div className="flex min-w-0 items-center gap-3">
                    <img
                      className="size-12 shrink-0 rounded-xl border bg-background object-cover"
                      src={member.identity.avatarUrl}
                      alt=""
                    />
                    <div className="min-w-0">
                      <p className="font-medium leading-tight">{member.identity.name}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {isCurrentIdentity ? "You · " : ""}
                        {roleLabel(member.membership.role)}
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-4 border-t pt-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                    <label className="min-w-0 text-sm font-medium">
                      Workspace role
                      <select
                        name="role"
                        aria-label={`Role for ${member.identity.name}`}
                        defaultValue={member.membership.role}
                        disabled={!canManageMember}
                        className="mt-2 h-11 w-full rounded-xl border bg-background px-3 font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        {actorIsOwner ? <option value="owner">Owner</option> : null}
                        <option value="admin">Admin</option>
                        <option value="member">Member</option>
                      </select>
                    </label>
                    <div className="grid gap-2 min-[28rem]:grid-cols-2 sm:flex sm:justify-end">
                      <Button
                        type="submit"
                        aria-label={`Save role for ${member.identity.name}`}
                        disabled={!canManageMember || changeRole.isPending}
                      >
                        Save role
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        aria-label={`Remove ${member.identity.name}`}
                        disabled={
                          !canManageMember || isCurrentIdentity || removeFullMember.isPending
                        }
                        onClick={() => remove(member)}
                      >
                        Remove member
                      </Button>
                    </div>
                  </div>
                </form>
              </li>
            );
          })}
        </ul>
      )}
      {administrationMessage === undefined ? null : (
        <p className="mt-4 text-sm text-muted-foreground" role="status">
          {administrationMessage}
        </p>
      )}
      {changeRole.error === null &&
      removeFullMember.error === null &&
      revokeInvitation.error === null ? null : (
        <p className="mt-4 text-sm text-destructive" role="alert">
          {administrationErrorMessage(
            changeRole.error ?? removeFullMember.error ?? revokeInvitation.error,
          )}
        </p>
      )}
      {invitationToast === undefined ? null : (
        <div
          className={`fixed right-5 bottom-5 z-50 flex max-w-sm items-start gap-3 rounded-2xl border bg-background p-4 shadow-lg ${
            invitationToast.kind === "error" ? "border-destructive/40" : "border-primary/30"
          }`}
          role={invitationToast.kind === "error" ? "alert" : "status"}
          aria-live={invitationToast.kind === "error" ? "assertive" : "polite"}
        >
          <p className="min-w-0 flex-1 text-sm leading-relaxed">{invitationToast.message}</p>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Dismiss notification"
            onClick={() => setInvitationToast(undefined)}
          >
            <span aria-hidden="true">×</span>
          </Button>
        </div>
      )}
    </section>
  );
}

interface PendingInvitationsSectionProps {
  readonly invitations: ReadonlyArray<PendingInvitationReference> | undefined;
  readonly isError: boolean;
  readonly isMutating: boolean;
  readonly isPending: boolean;
  readonly resendingInvitationId: string | undefined;
  readonly onResend: (invitationId: string, inviteeEmail: string) => void;
  readonly onRevoke: (invitationId: string, inviteeEmail: string) => void;
}

function PendingInvitationsSection({
  invitations,
  isError,
  isMutating,
  isPending,
  resendingInvitationId,
  onResend,
  onRevoke,
}: PendingInvitationsSectionProps): ReactElement {
  const [currentTimeMillis, setCurrentTimeMillis] = useState<number>();

  useEffect(() => {
    const updateCurrentTime = (): void => setCurrentTimeMillis(Date.now());
    updateCurrentTime();
    const intervalId = window.setInterval(updateCurrentTime, 1_000);
    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <section aria-labelledby="pending-invitations-heading" className="mt-8 border-t pt-6">
      <h3 id="pending-invitations-heading" className="font-heading text-lg font-semibold">
        Pending invitations
      </h3>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        Invitations remain here until they are accepted, expire, or are revoked. Resending creates a
        new link and invalidates the previous one. To prevent duplicate emails, an invitation can be
        resent at most once per minute.
      </p>
      {isPending ? (
        <p className="mt-4 text-sm text-muted-foreground" role="status">
          Loading pending invitations…
        </p>
      ) : isError || invitations === undefined ? (
        <p className="mt-4 text-sm text-destructive" role="alert">
          Cove could not load this Workspace's pending invitations.
        </p>
      ) : invitations.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed p-5 text-sm text-muted-foreground">
          No pending invitations.
        </p>
      ) : (
        <ul className="mt-4 grid gap-3">
          {invitations.map((invitation) => {
            const resendSeconds = resendSecondsRemaining(
              invitation.resendAvailableAt,
              currentTimeMillis,
            );
            const isResending = resendingInvitationId === invitation.id;

            return (
              <li
                className="grid gap-4 rounded-2xl border p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                key={invitation.id}
              >
                <div className="min-w-0">
                  <p className="break-all font-medium">{invitation.inviteeEmail}</p>
                  <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                    <div className="flex gap-1.5">
                      <dt>Sent</dt>
                      <dd>{formatInvitationDate(invitation.invitedAt)}</dd>
                    </div>
                    <div className="flex gap-1.5">
                      <dt>Expires</dt>
                      <dd>{formatInvitationDate(invitation.expiresAt)}</dd>
                    </div>
                  </dl>
                </div>
                <div className="grid gap-2 min-[28rem]:grid-cols-2 sm:flex sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    aria-label={`Resend invitation to ${invitation.inviteeEmail}`}
                    disabled={isMutating || resendSeconds === undefined || resendSeconds > 0}
                    onClick={() => onResend(invitation.id, invitation.inviteeEmail)}
                  >
                    {isResending
                      ? "Sending…"
                      : resendSeconds !== undefined && resendSeconds > 0
                        ? `Resend in ${resendSeconds}s`
                        : "Resend"}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    aria-label={`Revoke invitation to ${invitation.inviteeEmail}`}
                    disabled={isMutating}
                    onClick={() => onRevoke(invitation.id, invitation.inviteeEmail)}
                  >
                    Revoke
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function isFullMemberRole(role: string): role is FullMemberRole {
  return role === "owner" || role === "admin" || role === "member";
}

function formatInvitationDate(value: string): string {
  return invitationDateFormatter.format(new Date(value));
}

function resendSecondsRemaining(
  resendAvailableAt: string,
  currentTimeMillis: number | undefined,
): number | undefined {
  if (currentTimeMillis === undefined) return undefined;

  return Math.max(
    0,
    Math.ceil((new Date(resendAvailableAt).getTime() - currentTimeMillis) / 1_000),
  );
}

function resendInvitationErrorMessage(error: unknown): string {
  if (error instanceof CoveApiError && error.info.code === "WORKSPACE_INVITATION_RESEND_TOO_SOON") {
    return "That invitation was just sent. Wait for the countdown before sending another email.";
  }

  return "Cove could not resend this invitation. Try again in a moment.";
}

function invitationErrorMessage(error: unknown): string {
  if (!(error instanceof CoveApiError)) {
    return "Cove could not send this invitation. Try again in a moment.";
  }

  switch (error.info.code) {
    case "ALREADY_WORKSPACE_MEMBER":
      return "That Account is already a Full Member of this Workspace.";
    default:
      return "Cove could not send this invitation. Try again in a moment.";
  }
}

function administrationErrorMessage(error: unknown): string {
  if (!(error instanceof CoveApiError)) {
    return "Cove could not change this Membership. Try again in a moment.";
  }

  switch (error.info.code) {
    case "LAST_WORKSPACE_OWNER":
      return "Promote another Owner before demoting or removing the final Owner.";
    case "WORKSPACE_ADMINISTRATION_FORBIDDEN":
      return "Your Workspace Role cannot make that change.";
    case "FULL_MEMBER_UNAVAILABLE":
      return "That Full Member is no longer available.";
    case "WORKSPACE_INVITATION_UNAVAILABLE":
      return "That invitation is no longer pending. Refresh and try again.";
    default:
      return "Cove could not make that change. Try again in a moment.";
  }
}
