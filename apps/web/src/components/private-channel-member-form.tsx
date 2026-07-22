import { Button } from "@cove/ui/components/button";
import { type FormEvent, type ReactElement, useState } from "react";
import {
  useChannelsAddPrivateChannelMember,
  useChannelsListPrivateChannelMemberCandidates,
} from "../api/generated/cove-app.ts";
import { requiredFormValue } from "../form-data.ts";

interface PrivateChannelMemberFormProps {
  readonly channelId: string;
  readonly channelName: string;
  readonly className?: string;
  readonly excludedIdentityId?: string;
  readonly label: string;
  readonly onMembershipChanged: () => Promise<unknown>;
  readonly workspaceId: string;
}

export function PrivateChannelMemberForm({
  channelId,
  channelName,
  className,
  excludedIdentityId,
  label,
  onMembershipChanged,
  workspaceId,
}: PrivateChannelMemberFormProps): ReactElement {
  const candidates = useChannelsListPrivateChannelMemberCandidates(workspaceId, channelId, {
    query: { retry: false },
  });
  const addMember = useChannelsAddPrivateChannelMember();
  const [membershipMessage, setMembershipMessage] = useState<string>();
  const availableMembers =
    candidates.data?.members.filter((candidate) => candidate.id !== excludedIdentityId) ?? [];

  const add = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const workspaceIdentityId = requiredFormValue(new FormData(formElement), "workspaceIdentityId");
    const member = availableMembers.find((candidate) => candidate.id === workspaceIdentityId);
    if (member === undefined) return;

    setMembershipMessage(undefined);
    addMember.mutate(
      { workspaceId, channelId, workspaceIdentityId },
      {
        onSuccess: async () => {
          formElement.reset();
          await Promise.all([candidates.refetch(), onMembershipChanged()]);
          setMembershipMessage(`${member.name} joined ${channelName}.`);
        },
      },
    );
  };

  return (
    <div className={className}>
      {candidates.isPending ? (
        <p className="text-sm text-muted-foreground" role="status">
          Loading available Full Members…
        </p>
      ) : candidates.isError ? (
        <p className="text-sm text-destructive" role="alert">
          Cove could not load eligible Full Members for this Private Channel.
        </p>
      ) : availableMembers.length === 0 ? (
        <p className="text-sm text-muted-foreground">No other Full Members are available to add.</p>
      ) : (
        <form className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end" onSubmit={add}>
          <label className="text-sm font-medium">
            {label}
            <select
              name="workspaceIdentityId"
              required
              defaultValue=""
              className="mt-2 h-11 w-full rounded-xl border bg-background px-3 font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="" disabled>
                Choose a Full Member
              </option>
              {availableMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" disabled={addMember.isPending}>
            {addMember.isPending ? "Adding…" : "Add member"}
          </Button>
        </form>
      )}

      {membershipMessage === undefined ? null : (
        <p className="mt-3 text-sm text-muted-foreground" role="status">
          {membershipMessage}
        </p>
      )}
      {addMember.isError ? (
        <p className="mt-3 text-sm text-destructive" role="alert">
          Cove could not add that member. Refresh and try again.
        </p>
      ) : null}
    </div>
  );
}
