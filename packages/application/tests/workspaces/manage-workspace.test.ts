import { expect, it } from "@effect/vitest";
import {
  WorkspaceAccess,
  WorkspaceAvatarUrl,
  WorkspaceId,
  WorkspaceIdentityId,
  WorkspaceIdentityName,
  WorkspaceName,
  type Workspace,
  type WorkspaceAccess as WorkspaceAccessType,
  makeUserId,
  makeWorkspaceId,
  makeWorkspaceIdentityId,
} from "@cove/domain";
import { WorkspaceAccessRepository, WorkspaceIdentifierGenerator } from "@cove/ports";
import { Effect, Layer, Option, Ref } from "effect";
import {
  CreateWorkspaceInput,
  JoinWorkspaceInput,
  UpdateWorkspaceIdentityInput,
  createWorkspace,
  getWorkspaceIdentityDefaults,
  joinWorkspace,
  listWorkspaceAccess,
  updateWorkspaceIdentity,
} from "../../src/index.ts";

interface WorkspaceAccessTestOptions {
  readonly initial?: ReadonlyArray<WorkspaceAccessType>;
  readonly joinableWorkspace?: Workspace;
}

const workspaceAccessTestLayer = (options: WorkspaceAccessTestOptions = {}) =>
  Layer.effect(
    WorkspaceAccessRepository,
    Effect.gen(function* () {
      const accesses = yield* Ref.make(options.initial ?? []);

      const findAccess = (accountId: string, workspaceId: string) =>
        Ref.get(accesses).pipe(
          Effect.map((current) =>
            Option.fromNullishOr(
              current.find(
                (access) =>
                  access.identity.accountId === accountId && access.workspace.id === workspaceId,
              ),
            ),
          ),
        );

      return WorkspaceAccessRepository.of({
        createWorkspace: Effect.fn("WorkspaceAccessRepository.Test.createWorkspace")((access) =>
          Ref.update(accesses, (current) => [...current, access]).pipe(Effect.as(access)),
        ),
        joinWorkspace: Effect.fn("WorkspaceAccessRepository.Test.joinWorkspace")((identity) => {
          const workspace = options.joinableWorkspace;
          if (workspace === undefined || workspace.id !== identity.workspaceId) {
            return Effect.succeed(Option.none());
          }
          const joined = WorkspaceAccess.make({ workspace, identity, role: "member" });
          return Ref.update(accesses, (current) => [...current, joined]).pipe(
            Effect.as(Option.some(joined)),
          );
        }),
        listForAccount: Effect.fn("WorkspaceAccessRepository.Test.listForAccount")((accountId) =>
          Ref.get(accesses).pipe(
            Effect.map((current) =>
              current.filter((access) => access.identity.accountId === accountId),
            ),
          ),
        ),
        findForAccount: Effect.fn("WorkspaceAccessRepository.Test.findForAccount")(findAccess),
        findIdentityForAccount: Effect.fn("WorkspaceAccessRepository.Test.findIdentityForAccount")(
          (accountId, workspaceId) =>
            findAccess(accountId, workspaceId).pipe(
              Effect.map(Option.map((access) => access.identity)),
            ),
        ),
        updateIdentity: Effect.fn("WorkspaceAccessRepository.Test.updateIdentity")(
          (accountId, workspaceId, profile) =>
            Ref.modify(accesses, (current) => {
              const existing = current.find(
                (access) =>
                  access.identity.accountId === accountId && access.workspace.id === workspaceId,
              );
              if (existing === undefined) return [Option.none(), current] as const;
              const updated = WorkspaceAccess.make({
                ...existing,
                identity: { ...existing.identity, ...profile },
              });
              return [
                Option.some(updated),
                current.map((access) =>
                  access.identity.id === existing.identity.id ? updated : access,
                ),
              ] as const;
            }),
        ),
        endMembership: Effect.fn("WorkspaceAccessRepository.Test.endMembership")(() =>
          Effect.succeed("not-found" as const),
        ),
      });
    }),
  );

const workspaceIdentifierTestLayer = (
  workspaceId: WorkspaceId,
  workspaceIdentityId: WorkspaceIdentityId,
) =>
  Layer.succeed(
    WorkspaceIdentifierGenerator,
    WorkspaceIdentifierGenerator.of({
      nextWorkspaceId: Effect.fn("WorkspaceIdentifierGenerator.Test.nextWorkspaceId")(() =>
        Effect.succeed(workspaceId),
      ),
      nextWorkspaceIdentityId: Effect.fn(
        "WorkspaceIdentifierGenerator.Test.nextWorkspaceIdentityId",
      )(() => Effect.succeed(workspaceIdentityId)),
    }),
  );

const makeExistingAccess = Effect.fn("WorkspaceAccessTest.makeExistingAccess")(function* () {
  const accountId = yield* makeUserId("account-1");
  const workspaceId = yield* makeWorkspaceId("workspace-1");
  return WorkspaceAccess.make({
    workspace: { id: workspaceId, name: WorkspaceName.make("Product Studio") },
    identity: {
      id: yield* makeWorkspaceIdentityId("identity-1"),
      workspaceId,
      accountId,
      name: WorkspaceIdentityName.make("Alice Product"),
      avatarUrl: WorkspaceAvatarUrl.make("/avatars/alice.svg"),
    },
    role: "owner",
  });
});

it.effect("creates a workspace with the current account as its owner and identity", () =>
  Effect.gen(function* () {
    const accountId = yield* makeUserId("account-1");
    const workspaceId = yield* makeWorkspaceId("workspace-1");
    const identityId = yield* makeWorkspaceIdentityId("identity-1");
    const layer = Layer.mergeAll(
      workspaceAccessTestLayer(),
      workspaceIdentifierTestLayer(workspaceId, identityId),
    );

    const created = yield* createWorkspace(
      CreateWorkspaceInput.make({
        actorId: accountId,
        workspaceName: WorkspaceName.make("Product Studio"),
        profile: {
          name: WorkspaceIdentityName.make("Alice Product"),
          avatarUrl: WorkspaceAvatarUrl.make("/avatars/alice.svg"),
        },
      }),
    ).pipe(Effect.provide(layer));

    expect(created).toEqual(
      WorkspaceAccess.make({
        workspace: { id: workspaceId, name: WorkspaceName.make("Product Studio") },
        identity: {
          id: identityId,
          workspaceId,
          accountId,
          name: WorkspaceIdentityName.make("Alice Product"),
          avatarUrl: WorkspaceAvatarUrl.make("/avatars/alice.svg"),
        },
        role: "owner",
      }),
    );
  }),
);

it.effect("offers the selected workspace identity as profile defaults", () =>
  Effect.gen(function* () {
    const existing = yield* makeExistingAccess();
    const workspaceId = yield* makeWorkspaceId("workspace-2");
    const selected = WorkspaceAccess.make({
      workspace: { id: workspaceId, name: WorkspaceName.make("Design Guild") },
      identity: {
        id: yield* makeWorkspaceIdentityId("identity-2"),
        workspaceId,
        accountId: existing.identity.accountId,
        name: WorkspaceIdentityName.make("Alice Design"),
        avatarUrl: WorkspaceAvatarUrl.make("/avatars/design.svg"),
      },
      role: "member",
    });
    const defaults = yield* getWorkspaceIdentityDefaults(
      existing.identity.accountId,
      selected.workspace.id,
    ).pipe(Effect.provide(workspaceAccessTestLayer({ initial: [existing, selected] })));

    expect(defaults).toEqual({
      name: "Alice Design",
      avatarUrl: "/avatars/design.svg",
    });
  }),
);

it.effect("joins another workspace with edited copies of identity defaults", () =>
  Effect.gen(function* () {
    const existing = yield* makeExistingAccess();
    const workspaceId = yield* makeWorkspaceId("workspace-2");
    const identityId = yield* makeWorkspaceIdentityId("identity-2");
    const joined = yield* joinWorkspace(
      JoinWorkspaceInput.make({
        actorId: existing.identity.accountId,
        workspaceId,
        profile: {
          name: WorkspaceIdentityName.make("Alice Design"),
          avatarUrl: existing.identity.avatarUrl,
        },
      }),
    ).pipe(
      Effect.provide(
        Layer.mergeAll(
          workspaceAccessTestLayer({
            initial: [existing],
            joinableWorkspace: {
              id: workspaceId,
              name: WorkspaceName.make("Design Guild"),
            },
          }),
          workspaceIdentifierTestLayer(workspaceId, identityId),
        ),
      ),
    );

    expect(joined).toMatchObject({
      workspace: { id: "workspace-2", name: "Design Guild" },
      identity: {
        name: "Alice Design",
        avatarUrl: "/avatars/alice.svg",
      },
      role: "member",
    });
  }),
);

it.effect("edits one workspace identity without changing another", () =>
  Effect.gen(function* () {
    const firstAccess = yield* makeExistingAccess();
    const secondWorkspaceId = yield* makeWorkspaceId("workspace-2");
    const secondAccess = WorkspaceAccess.make({
      workspace: { id: secondWorkspaceId, name: WorkspaceName.make("Design Guild") },
      identity: {
        id: yield* makeWorkspaceIdentityId("identity-2"),
        workspaceId: secondWorkspaceId,
        accountId: firstAccess.identity.accountId,
        name: firstAccess.identity.name,
        avatarUrl: firstAccess.identity.avatarUrl,
      },
      role: "member",
    });
    const otherAccountAccess = WorkspaceAccess.make({
      workspace: secondAccess.workspace,
      identity: {
        id: yield* makeWorkspaceIdentityId("identity-3"),
        workspaceId: secondWorkspaceId,
        accountId: yield* makeUserId("account-2"),
        name: WorkspaceIdentityName.make("Bob Design"),
        avatarUrl: WorkspaceAvatarUrl.make("/avatars/bob.svg"),
      },
      role: "member",
    });
    const layer = workspaceAccessTestLayer({
      initial: [firstAccess, secondAccess, otherAccountAccess],
    });

    const result = yield* Effect.gen(function* () {
      const updated = yield* updateWorkspaceIdentity(
        UpdateWorkspaceIdentityInput.make({
          actorId: firstAccess.identity.accountId,
          workspaceId: secondWorkspaceId,
          profile: {
            name: WorkspaceIdentityName.make("Alice Design"),
            avatarUrl: WorkspaceAvatarUrl.make("/avatars/default.svg"),
          },
        }),
      );
      const listed = yield* listWorkspaceAccess(firstAccess.identity.accountId);
      return { listed, updated };
    }).pipe(Effect.provide(layer));

    expect(result.listed).toEqual([firstAccess, result.updated]);
  }),
);
