import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { OpenApi } from "effect/unstable/httpapi";
import { CoveOperationsApi, CovePublicApi } from "../src/index.ts";
import { makeCoveAppOpenApi } from "../src/app-openapi.ts";

it.effect("publishes only the deliberate public HTTP contract", () =>
  Effect.sync(() => {
    const document = OpenApi.fromApi(CovePublicApi);

    expect(document.info).toMatchObject({
      title: "Cove Public API",
      version: "1.0.0",
    });
    expect(document.paths).toEqual({});
    expect(document.components.securitySchemes).toEqual({});
  }),
);

it.effect("keeps first-party operations in the app HTTP contract", () =>
  Effect.sync(() => {
    const document = makeCoveAppOpenApi();

    expect(document.info).toMatchObject({
      title: "Cove App API",
      version: "1.0.0",
    });
    expect(Object.keys(document.paths).sort()).toEqual([
      "/api/app/v1/auth/login",
      "/api/app/v1/auth/login/verify",
      "/api/app/v1/auth/logout",
      "/api/app/v1/me",
      "/api/app/v1/workspace-invitations",
      "/api/app/v1/workspace-invitations/redeem",
      "/api/app/v1/workspace-invitations/{invitationId}/accept",
      "/api/app/v1/workspaces",
      "/api/app/v1/workspaces/{workspaceId}",
      "/api/app/v1/workspaces/{workspaceId}/identity",
      "/api/app/v1/workspaces/{workspaceId}/invitations",
      "/api/app/v1/workspaces/{workspaceId}/members",
      "/api/app/v1/workspaces/{workspaceId}/members/{workspaceIdentityId}",
      "/api/app/v1/workspaces/{workspaceId}/members/{workspaceIdentityId}/role",
      "/api/app/v1/workspaces/{workspaceId}/membership",
    ]);
    expect(document.paths).not.toHaveProperty("/health/live");
    expect(document.paths["/api/app/v1/auth/login"]?.post?.responses).toHaveProperty("202");
    expect(document.paths["/api/app/v1/auth/login"]?.post?.responses).toHaveProperty("500");
    expect(document.paths["/api/app/v1/auth/login/verify"]?.post?.responses).toHaveProperty("200");
    expect(document.paths["/api/app/v1/auth/login/verify"]?.post?.responses).toHaveProperty("401");
    expect(document.paths["/api/app/v1/auth/login/verify"]?.post?.responses).toHaveProperty("500");
    expect(document.paths["/api/app/v1/me"]?.get?.responses).toHaveProperty("401");
    expect(document.paths["/api/app/v1/me"]?.get?.responses).toHaveProperty("500");
    expect(document.paths["/api/app/v1/me"]?.get?.security).toEqual([{ sessionCookie: [] }]);
    expect(document.paths["/api/app/v1/auth/logout"]?.post?.security).toEqual([
      { sessionCookie: [] },
    ]);
    expect(document.paths["/api/app/v1/auth/logout"]?.post?.responses).toHaveProperty("403");
    expect(document.paths["/api/app/v1/auth/logout"]?.post?.parameters).toContainEqual(
      expect.objectContaining({
        in: "header",
        name: "x-csrf-token",
      }),
    );
    expect(document.paths["/api/app/v1/workspaces"]?.post?.responses).toHaveProperty("200");
    expect(
      document.paths["/api/app/v1/workspaces/{workspaceId}/identity"]?.patch?.responses,
    ).toHaveProperty("200");
    expect(document.paths["/api/app/v1/workspaces"]?.post?.parameters).toContainEqual(
      expect.objectContaining({
        in: "header",
        name: "x-csrf-token",
      }),
    );
    expect(document.components.securitySchemes).toMatchObject({
      sessionCookie: {
        type: "apiKey",
        in: "cookie",
        name: "cove_session",
      },
    });
    expect(document.components.schemas).toMatchObject({
      CoveAppErrorResponse: {
        anyOf: expect.arrayContaining([
          { $ref: "#/components/schemas/InvalidMagicLinkResponse" },
          { $ref: "#/components/schemas/WorkspaceUnavailableResponse" },
        ]),
      },
      LoginRequest: {
        properties: {
          email: {
            type: "string",
            allOf: expect.arrayContaining([expect.objectContaining({ type: "string" })]),
          },
        },
      },
      VerifyMagicLinkRequest: {
        properties: {
          token: {
            type: "string",
            allOf: [expect.objectContaining({ minLength: 1, type: "string" })],
          },
        },
      },
    });
  }),
);

it.effect("keeps health checks in the operations HTTP contract", () =>
  Effect.sync(() => {
    const document = OpenApi.fromApi(CoveOperationsApi);

    expect(document.info).toMatchObject({
      title: "Cove Operations API",
      version: "1.0.0",
    });
    expect(Object.keys(document.paths).sort()).toEqual(["/health/live", "/health/ready"]);
    expect(document.paths["/health/live"]?.get?.responses).toHaveProperty("200");
    expect(document.paths["/health/ready"]?.get?.responses).toHaveProperty("200");
    expect(document.paths["/health/ready"]?.get?.responses).toHaveProperty("503");
    expect(document.paths).not.toHaveProperty("/api/app/v1/auth/login");
  }),
);
