import { afterEach, describe, expect, expectTypeOf, it, vi } from "vite-plus/test";
import { authLogin, authVerifyMagicLink } from "./generated/cove-app.ts";
import { CoveApiError, coveFetch } from "./cove-fetch.ts";

afterEach(() => vi.unstubAllGlobals());

describe("Cove API transport", () => {
  it("keeps generated request fields constrained to strings", () => {
    expectTypeOf<Parameters<typeof authLogin>[0]["email"]>().toEqualTypeOf<string>();
    expectTypeOf<Parameters<typeof authVerifyMagicLink>[0]["token"]>().toEqualTypeOf<string>();
  });

  it("sends same-origin credentials and the browser CSRF token", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(new Response(null, { status: 204 })),
    );
    vi.stubGlobal("document", { cookie: "other=value; cove_csrf=csrf-token" });
    vi.stubGlobal("fetch", fetchMock);

    await expect(coveFetch("/test", { method: "POST" })).resolves.toHaveProperty("status", 204);

    const options = fetchMock.mock.calls[0]?.[1];
    expect(options?.credentials).toBe("same-origin");
    expect(new Headers(options?.headers).get("x-csrf-token")).toBe("csrf-token");
  });

  it("decodes API errors before exposing them to queries", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              code: "INTERNAL_SERVER_ERROR",
              message: "The server could not complete the request.",
            }),
            { headers: { "content-type": "application/json" }, status: 500 },
          ),
        ),
      ),
    );

    try {
      await authLogin({ email: "alice@example.com" });
      expect.unreachable("Expected authLogin to reject.");
    } catch (error) {
      expect(error).toBeInstanceOf(CoveApiError);
      expect(error).toMatchObject({
        info: {
          code: "INTERNAL_SERVER_ERROR",
          message: "The server could not complete the request.",
        },
        status: 500,
      });
    }
  });

  it("rejects a success response that does not match the OpenAPI schema", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Promise.resolve(
          new Response(JSON.stringify({ status: "unexpected" }), {
            headers: { "content-type": "application/json" },
            status: 200,
          }),
        ),
      ),
    );

    await expect(authLogin({ email: "alice@example.com" })).rejects.toHaveProperty(
      "name",
      "ZodError",
    );
  });

  it("rejects an error response with a code outside the generated API contract", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Promise.resolve(
          new Response(JSON.stringify({ code: "UNKNOWN", message: "Unknown error." }), {
            headers: { "content-type": "application/json" },
            status: 500,
          }),
        ),
      ),
    );

    await expect(authLogin({ email: "alice@example.com" })).rejects.toHaveProperty(
      "name",
      "ZodError",
    );
  });
});
