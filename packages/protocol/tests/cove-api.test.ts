import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { OpenApi } from "effect/unstable/httpapi";
import { CoveApi } from "../src/index.ts";

it.effect("describes the health HTTP contract as OpenAPI", () =>
  Effect.sync(() => {
    const document = OpenApi.fromApi(CoveApi);

    expect(document.info).toMatchObject({
      title: "Cove API",
      version: "1.0.0",
    });
    expect(document.paths["/health/live"]?.get?.responses).toHaveProperty("200");
    expect(document.paths["/health/ready"]?.get?.responses).toHaveProperty("200");
    expect(document.paths["/health/ready"]?.get?.responses).toHaveProperty("503");
    expect(document.paths["/api/v1/auth/login"]?.post?.responses).toHaveProperty("202");
    expect(document.paths["/api/v1/auth/login"]?.post?.responses).toHaveProperty("500");
    expect(document.paths["/api/v1/auth/login/verify"]?.post?.responses).toHaveProperty("200");
    expect(document.paths["/api/v1/auth/login/verify"]?.post?.responses).toHaveProperty("401");
    expect(document.paths["/api/v1/auth/login/verify"]?.post?.responses).toHaveProperty("500");
    expect(document.paths["/api/v1/me"]?.get?.responses).toHaveProperty("401");
    expect(document.paths["/api/v1/me"]?.get?.responses).toHaveProperty("500");
    expect(document.paths["/api/v1/me"]?.get?.security).toEqual([{ sessionCookie: [] }]);
    expect(document.paths["/api/v1/auth/logout"]?.post?.security).toEqual([{ sessionCookie: [] }]);
    expect(document.paths["/api/v1/auth/logout"]?.post?.responses).toHaveProperty("403");
    expect(document.paths["/api/v1/auth/logout"]?.post?.parameters).toContainEqual(
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
  }),
);
