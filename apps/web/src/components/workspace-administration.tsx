import { Button } from "@cove/ui/components/button";
import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { CoveApiError } from "../api/cove-fetch.ts";
import {
  getWorkspacesGetWorkspaceQueryKey,
  invalidateWorkspacesListWorkspaces,
  useWorkspacesChangeWorkspaceRole,
  useWorkspacesInviteWorkspaceMember,
  useWorkspacesListWorkspaceMembers,
  useWorkspacesRemoveWorkspaceMember,
} from "../api/generated/cove-app.ts";
import { requiredFormValue } from "../form-data.ts";

export function WorkspaceAdministration({
  actorIsOwner,
  currentIdentityId,
  workspaceId,
}: {
  readonly actorIsOwner: boolean;
  readonly currentIdentityId: string;
  readonly workspaceId: string;
}) {
  const queryClient = useQueryClient();
  const members = useWorkspacesListWorkspaceMembers(workspaceId, { query: { retry: false } });
  const inviteMember = useWorkspacesInviteWorkspaceMember();
  const changeRole = useWorkspacesChangeWorkspaceRole();
  const removeMember = useWorkspacesRemoveWorkspaceMember();
  const [invitedEmail, setInvitedEmail] = useState<string>();
  const [administrationMessage, setAdministrationMessage] = useState<string>();

  const invite = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const email = requiredFormValue(form, "inviteeEmail");
    setInvitedEmail(undefined);
    inviteMember.mutate(
      { workspaceId, data: { email } },
      {
        onSuccess: () => {
          formElement.reset();
          setInvitedEmail(email);
        },
      },
    );
  };

  const refreshMemberships = async () => {
    await Promise.all([
      members.refetch(),
      queryClient.invalidateQueries({
        queryKey: getWorkspacesGetWorkspaceQueryKey(workspaceId),
      }),
      invalidateWorkspacesListWorkspaces(queryClient),
    ]);
  };

  const saveRole = (
    event: FormEvent<HTMLFormElement>,
    member: { readonly identity: { readonly id: string; readonly name: string } },
  ) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const role = requiredFormValue(form, "role");
    if (role !== "admin" && role !== "member" && role !== "owner") return;
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

  const remove = (member: {
    readonly identity: { readonly id: string; readonly name: string };
  }) => {
    setAdministrationMessage(undefined);
    removeMember.mutate(
      { workspaceId, workspaceIdentityId: member.identity.id },
      {
        onSuccess: async () => {
          await refreshMemberships();
          setAdministrationMessage(`${member.identity.name}'s Membership ended.`);
        },
      },
    );
  };

  return (
    <section className="mt-10 border-t pt-6">
      <h2 className="font-heading text-xl font-semibold">Full Members</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Invite Accounts as Members and deliberately assign Workspace Roles. Owners alone can appoint
        another Owner.
      </p>

      <form className="mt-6 flex flex-col gap-3 sm:flex-row" onSubmit={invite}>
        <label className="min-w-0 flex-1 text-sm font-medium">
          Account email to invite
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

      {members.isPending ? (
        <p className="mt-8 text-sm text-muted-foreground" role="status">
          Loading Full Members…
        </p>
      ) : members.isError ? (
        <p className="mt-8 text-sm text-destructive" role="alert">
          Cove could not load this Workspace's Full Members.
        </p>
      ) : (
        <ul className="mt-8 grid gap-3">
          {members.data.members.map((member) => {
            const isCurrentIdentity = member.identity.id === currentIdentityId;
            const canManageMember = actorIsOwner || member.membership.role !== "owner";

            return (
              <li className="rounded-2xl border p-4" key={member.identity.id}>
                <form
                  className="flex flex-col gap-4 sm:flex-row sm:items-end"
                  onSubmit={(event) => saveRole(event, member)}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3 self-center sm:self-auto">
                    <img
                      className="size-11 rounded-xl border bg-background object-cover"
                      src={member.identity.avatarUrl}
                      alt=""
                    />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{member.identity.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {isCurrentIdentity ? "You · " : ""}
                        {roleLabel(member.membership.role)}
                      </p>
                    </div>
                  </div>
                  <label className="text-sm font-medium">
                    Role for {member.identity.name}
                    <select
                      name="role"
                      defaultValue={member.membership.role}
                      disabled={!canManageMember}
                      className="mt-2 h-11 w-full rounded-xl border bg-background px-3 font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:w-36"
                    >
                      {actorIsOwner ? <option value="owner">Owner</option> : null}
                      <option value="admin">Admin</option>
                      <option value="member">Member</option>
                    </select>
                  </label>
                  <Button type="submit" disabled={!canManageMember || changeRole.isPending}>
                    Save role for {member.identity.name}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={!canManageMember || isCurrentIdentity || removeMember.isPending}
                    onClick={() => remove(member)}
                  >
                    Remove {member.identity.name}
                  </Button>
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
      {changeRole.error === null && removeMember.error === null ? null : (
        <p className="mt-4 text-sm text-destructive" role="alert">
          {administrationErrorMessage(changeRole.error ?? removeMember.error)}
        </p>
      )}
    </section>
  );
}

function roleLabel(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function invitationErrorMessage(error: unknown): string {
  if (!(error instanceof CoveApiError)) {
    return "Cove could not send this invitation. Try again in a moment.";
  }

  switch (error.info.code) {
    case "ALREADY_WORKSPACE_MEMBER":
      return "That Account is already a Full Member of this Workspace.";
    case "WORKSPACE_INVITATION_ALREADY_PENDING":
      return "That Account already has a pending invitation.";
    case "WORKSPACE_INVITEE_UNAVAILABLE":
      return "Cove could not find an Account with that email address.";
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
    case "WORKSPACE_MEMBER_UNAVAILABLE":
      return "That Full Member is no longer available.";
    default:
      return "Cove could not change this Membership. Try again in a moment.";
  }
}
