import { Button } from "@cove/ui/components/button";
import { type FormEvent, type ReactElement, useState } from "react";
import {
  useTopicsAddContribution,
  useTopicsDeleteContribution,
  useTopicsEditContribution,
} from "../api/generated/cove-app.ts";
import { requiredFormValue } from "../form-data.ts";

interface TopicContribution {
  readonly id: string;
  readonly body?: string;
  readonly position: number;
  readonly edited: boolean;
  readonly deleted: boolean;
  readonly author: {
    readonly id: string;
    readonly name: string;
    readonly avatarUrl: string;
  };
}

interface TopicContributionsProps {
  readonly canContribute: boolean;
  readonly channelId: string;
  readonly contributions: ReadonlyArray<TopicContribution>;
  readonly currentIdentityId: string;
  readonly refresh: () => Promise<void>;
  readonly topicId: string;
  readonly workspaceId: string;
}

const contributionLabel = (position: number): string =>
  position === 1 ? "Opening Brief" : `Contribution ${position}`;

export function TopicContributions({
  canContribute,
  channelId,
  contributions,
  currentIdentityId,
  refresh,
  topicId,
  workspaceId,
}: TopicContributionsProps): ReactElement {
  const addContribution = useTopicsAddContribution();
  const editContribution = useTopicsEditContribution();
  const deleteContribution = useTopicsDeleteContribution();
  const [editingId, setEditingId] = useState<string>();
  const [deletingId, setDeletingId] = useState<string>();
  const mutationPending =
    addContribution.isPending || editContribution.isPending || deleteContribution.isPending;

  const add = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    addContribution.mutate(
      {
        workspaceId,
        channelId,
        topicId,
        data: { body: requiredFormValue(form, "contributionBody") },
      },
      {
        onSuccess: async () => {
          formElement.reset();
          await refresh();
        },
      },
    );
  };

  const edit = (event: FormEvent<HTMLFormElement>, contributionId: string): void => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    editContribution.mutate(
      {
        workspaceId,
        channelId,
        topicId,
        contributionId,
        data: { body: requiredFormValue(form, "contributionBody") },
      },
      {
        onSuccess: async () => {
          setEditingId(undefined);
          await refresh();
        },
      },
    );
  };

  const remove = (contributionId: string): void => {
    deleteContribution.mutate(
      { workspaceId, channelId, topicId, contributionId },
      {
        onSuccess: async () => {
          setDeletingId(undefined);
          await refresh();
        },
      },
    );
  };

  return (
    <>
      <ol className="divide-y" aria-label="Topic contributions">
        {contributions.map((contribution) => {
          const label = contributionLabel(contribution.position);
          const isAuthor = contribution.author.id === currentIdentityId;
          const canChange = canContribute && isAuthor && !contribution.deleted;
          const isEditing = editingId === contribution.id;
          const isDeleting = deletingId === contribution.id;

          return (
            <li key={contribution.id} className="py-8">
              <article aria-labelledby={`contribution-${contribution.id}`}>
                <header className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <img
                      className="size-10 rounded-full border border-border bg-muted object-cover"
                      src={contribution.author.avatarUrl}
                      alt=""
                    />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 id={`contribution-${contribution.id}`} className="font-semibold">
                          {label}
                        </h3>
                        {contribution.edited && !contribution.deleted ? (
                          <span className="text-xs font-medium text-muted-foreground">Edited</span>
                        ) : null}
                      </div>
                      <p className="text-sm text-muted-foreground">{contribution.author.name}</p>
                    </div>
                  </div>

                  {canChange && !isEditing && !isDeleting ? (
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Edit ${label}`}
                        onClick={() => {
                          editContribution.reset();
                          setEditingId(contribution.id);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Delete ${label}`}
                        onClick={() => {
                          deleteContribution.reset();
                          setDeletingId(contribution.id);
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  ) : null}
                </header>

                {contribution.deleted ? (
                  <p className="mt-5 text-sm italic text-muted-foreground">Contribution removed</p>
                ) : isEditing ? (
                  <form className="mt-5" onSubmit={(event) => edit(event, contribution.id)}>
                    <label className="sr-only" htmlFor={`edit-contribution-${contribution.id}`}>
                      Edit {label}
                    </label>
                    <textarea
                      id={`edit-contribution-${contribution.id}`}
                      name="contributionBody"
                      defaultValue={contribution.body}
                      required
                      rows={5}
                      className="w-full resize-y rounded-lg border bg-background px-4 py-3 leading-6 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    />
                    {editContribution.isError ? (
                      <p className="mt-2 text-sm text-destructive" role="alert">
                        Cove could not save this edit. Refresh and try again.
                      </p>
                    ) : null}
                    <div className="mt-3 flex items-center gap-2">
                      <Button type="submit" disabled={mutationPending}>
                        {editContribution.isPending ? "Saving…" : "Save edit"}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={mutationPending}
                        onClick={() => setEditingId(undefined)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                ) : (
                  <p className="mt-5 whitespace-pre-wrap text-base leading-7 text-foreground/90">
                    {contribution.body}
                  </p>
                )}

                {isDeleting ? (
                  <div className="mt-5 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                    <p className="text-sm text-foreground">
                      Remove this Contribution? Its place in the Topic will remain visible.
                    </p>
                    {deleteContribution.isError ? (
                      <p className="mt-2 text-sm text-destructive" role="alert">
                        Cove could not remove this Contribution. Refresh and try again.
                      </p>
                    ) : null}
                    <div className="mt-3 flex items-center gap-2">
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={mutationPending}
                        aria-label={`Confirm delete ${label}`}
                        onClick={() => remove(contribution.id)}
                      >
                        {deleteContribution.isPending ? "Removing…" : "Confirm delete"}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={mutationPending}
                        onClick={() => setDeletingId(undefined)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : null}
              </article>
            </li>
          );
        })}
      </ol>

      {canContribute ? (
        <form className="border-t pt-8" onSubmit={add}>
          <label className="text-base font-semibold" htmlFor="newContribution">
            Add a Contribution
          </label>
          <textarea
            id="newContribution"
            name="contributionBody"
            required
            rows={5}
            className="mt-3 w-full resize-y rounded-lg border bg-background px-4 py-3 leading-6 outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            placeholder="Add context, evidence, or a response to this Topic."
          />
          {addContribution.isError ? (
            <p className="mt-2 text-sm text-destructive" role="alert">
              Cove could not add this Contribution. Refresh and try again.
            </p>
          ) : null}
          <div className="mt-3 flex justify-end">
            <Button type="submit" size="lg" disabled={mutationPending}>
              {addContribution.isPending ? "Adding…" : "Add contribution"}
            </Button>
          </div>
        </form>
      ) : null}
    </>
  );
}
