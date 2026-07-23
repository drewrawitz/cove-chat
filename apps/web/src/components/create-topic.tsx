import { Button, buttonVariants } from "@cove/ui/components/button";
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
import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, type ReactElement, useRef, useState } from "react";
import { useTopicsCreateTopic } from "../api/generated/cove-app.ts";
import { requiredFormValue } from "../form-data.ts";
import { topicIntentFromFormValue, topicIntentOptions } from "../topic-intent.ts";

interface CreateTopicProps {
  readonly channelId: string;
  readonly workspaceId: string;
}

export function CreateTopic({ channelId, workspaceId }: CreateTopicProps): ReactElement {
  const [dialogOpen, setDialogOpen] = useState(false);
  const titleInput = useRef<HTMLInputElement>(null);
  const createTopic = useTopicsCreateTopic();
  const navigate = useNavigate();

  const setOpen = (open: boolean): void => {
    if (createTopic.isPending) return;
    if (open) createTopic.reset();
    setDialogOpen(open);
  };

  const create = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const intent = topicIntentFromFormValue(requiredFormValue(form, "topicIntent"));
    const data = {
      title: requiredFormValue(form, "topicTitle"),
      openingBrief: requiredFormValue(form, "openingBrief"),
      ...(intent === undefined ? {} : { intent }),
    };

    createTopic.mutate(
      { workspaceId, channelId, data },
      {
        onSuccess: async (topic) => {
          formElement.reset();
          setDialogOpen(false);
          await navigate({
            to: "/workspaces/$workspaceId/channels/$channelId/topics/$topicId",
            params: { workspaceId, channelId, topicId: topic.id },
            state: (previous) => ({ ...previous, justCreatedTopicId: topic.id }),
          });
        },
      },
    );
  };

  return (
    <DialogRoot open={dialogOpen} onOpenChange={setOpen}>
      <DialogTrigger className={buttonVariants({ size: "lg" })}>Start a topic</DialogTrigger>
      <DialogPortal>
        <DialogBackdrop />
        <DialogPopup initialFocus={titleInput}>
          <form onSubmit={create}>
            <header className="flex items-start justify-between gap-6 border-b p-6 sm:p-8">
              <div>
                <DialogTitle>Start a Topic</DialogTitle>
                <DialogDescription className="mt-2 leading-6">
                  Name the conversation and give participants the context they need in an Opening
                  Brief.
                </DialogDescription>
              </div>
              <DialogClose
                aria-label="Close new Topic dialog"
                className="flex size-10 shrink-0 items-center justify-center rounded-lg text-2xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <span aria-hidden="true">×</span>
              </DialogClose>
            </header>

            <div className="grid gap-7 p-6 sm:p-8">
              <label className="text-base font-semibold" htmlFor="topicTitle">
                Topic title
                <input
                  id="topicTitle"
                  ref={titleInput}
                  name="topicTitle"
                  required
                  className="mt-3 h-12 w-full rounded-lg border bg-background px-4 font-normal outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  placeholder="What should people be able to find later?"
                />
              </label>

              <label className="text-base font-semibold" htmlFor="openingBrief">
                Opening Brief
                <textarea
                  id="openingBrief"
                  name="openingBrief"
                  required
                  rows={7}
                  className="mt-3 w-full resize-y rounded-lg border bg-background px-4 py-3 font-normal leading-6 outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  placeholder="Establish the subject, context, and what participants should consider."
                />
              </label>

              <label className="text-base font-semibold" htmlFor="topicIntent">
                Topic Intent <span className="font-normal text-muted-foreground">(optional)</span>
                <select
                  id="topicIntent"
                  name="topicIntent"
                  defaultValue=""
                  className="mt-3 h-12 w-full rounded-lg border bg-background px-4 font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <option value="">No intent</option>
                  {topicIntentOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              {createTopic.isError ? (
                <p className="text-sm text-destructive" role="alert">
                  Cove could not create this Topic. Check the title and Opening Brief, then try
                  again.
                </p>
              ) : null}
            </div>

            <footer className="flex justify-end gap-3 border-t p-6 sm:px-8">
              <DialogClose className={buttonVariants({ variant: "secondary", size: "lg" })}>
                Cancel
              </DialogClose>
              <Button type="submit" size="lg" disabled={createTopic.isPending}>
                {createTopic.isPending ? "Creating…" : "Create topic"}
              </Button>
            </footer>
          </form>
        </DialogPopup>
      </DialogPortal>
    </DialogRoot>
  );
}
