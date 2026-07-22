import {
  DialogBackdrop,
  DialogClose,
  DialogDescription,
  DialogPopup,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
} from "@cove/ui/components/dialog";
import { type ReactElement } from "react";
import { useChannelsGetPrivateChannelAdministration } from "../api/generated/cove-app.ts";
import { PrivateChannelMemberForm } from "./private-channel-member-form.tsx";

interface PrivateChannelMembershipProps {
  readonly canAdminister: boolean;
  readonly channelId: string;
  readonly channelName: string;
  readonly workspaceId: string;
}

export function PrivateChannelMembership({
  canAdminister,
  channelId,
  channelName,
  workspaceId,
}: PrivateChannelMembershipProps): ReactElement {
  const administration = useChannelsGetPrivateChannelAdministration(workspaceId, channelId, {
    query: { retry: false },
  });
  const memberCount = administration.data?.members.length;
  const memberCountLabel =
    memberCount === undefined
      ? "Manage channel members"
      : `Manage channel members, ${memberCount} ${memberCount === 1 ? "member" : "members"}`;

  return (
    <DialogRoot>
      <DialogTrigger
        aria-label={memberCountLabel}
        className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 text-sm font-medium text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <svg
          aria-hidden="true"
          className="size-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="9" cy="8" r="3.25" />
          <path d="M3.5 19c.35-4 2.2-6 5.5-6s5.15 2 5.5 6" />
          <path d="M16 11.5c2.7.4 4.15 2.25 4.5 5.5" />
          <path d="M15.5 4.9a3.2 3.2 0 0 1 0 6.2" />
        </svg>
        <span aria-hidden="true">{memberCount ?? "…"}</span>
      </DialogTrigger>

      <DialogPortal>
        <DialogBackdrop />
        <DialogPopup className="dark bg-card">
          <header className="flex items-start justify-between gap-6 border-b p-6 sm:p-8">
            <div>
              <DialogTitle>Manage members</DialogTitle>
              <DialogDescription className="mt-2">
                Private Channel content is visible only to these people.
              </DialogDescription>
            </div>
            <DialogClose
              aria-label="Close member manager"
              className="flex size-10 shrink-0 items-center justify-center rounded-lg text-2xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <span aria-hidden="true">×</span>
            </DialogClose>
          </header>

          <div className="grid gap-7 p-6 sm:p-8">
            <section aria-labelledby="current-channel-members-heading">
              <div className="flex items-baseline justify-between gap-4">
                <h3 id="current-channel-members-heading" className="text-lg font-semibold">
                  Channel members
                </h3>
                {memberCount === undefined ? null : (
                  <span className="text-sm text-muted-foreground">
                    {memberCount} {memberCount === 1 ? "member" : "members"}
                  </span>
                )}
              </div>

              {administration.isPending ? (
                <p className="mt-4 text-sm text-muted-foreground" role="status">
                  Loading Channel Members…
                </p>
              ) : administration.isError ? (
                <p className="mt-4 text-sm text-destructive" role="alert">
                  Cove could not load this Private Channel's members.
                </p>
              ) : (
                <ul className="mt-4 grid max-h-72 gap-2 overflow-y-auto rounded-xl border p-2">
                  {administration.data.members.map((member) => (
                    <li
                      className="flex min-w-0 items-center gap-3 rounded-lg bg-background/40 p-3"
                      key={member.id}
                    >
                      <img
                        className="size-10 shrink-0 rounded-full border bg-muted object-cover"
                        src={member.avatarUrl}
                        alt=""
                      />
                      <span className="truncate text-sm font-medium">{member.name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {canAdminister ? (
              <section aria-labelledby="add-channel-members-heading" className="border-t pt-6">
                <h3 id="add-channel-members-heading" className="text-lg font-semibold">
                  Add members
                </h3>
                <PrivateChannelMemberForm
                  channelId={channelId}
                  channelName={channelName}
                  className="mt-4"
                  label="Member to add"
                  onMembershipChanged={() => administration.refetch()}
                  workspaceId={workspaceId}
                />
              </section>
            ) : (
              <p className="border-t pt-6 text-sm text-muted-foreground">
                The Channel Maintainer and Workspace administrators manage membership.
              </p>
            )}
          </div>
        </DialogPopup>
      </DialogPortal>
    </DialogRoot>
  );
}
