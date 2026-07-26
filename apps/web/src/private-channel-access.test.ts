import { describe, expect, it } from "vite-plus/test";
import { CoveApiError } from "./api/cove-fetch.ts";
import {
  authoritativeChannelAccessState,
  privateChannelAccessState,
} from "./private-channel-access.ts";

describe("Private Channel rendering access", () => {
  it("keeps cached private content hidden until fresh HTTP and synchronized access complete", () => {
    expect(
      privateChannelAccessState({
        visibility: "private",
        connection: "connected",
        authoritativeAccess: "checking",
        synchronizedAccess: "available",
      }),
    ).toBe("checking");
    expect(
      privateChannelAccessState({
        visibility: "private",
        connection: "connected",
        authoritativeAccess: "available",
        synchronizedAccess: "checking",
      }),
    ).toBe("checking");
    expect(
      privateChannelAccessState({
        visibility: "private",
        connection: "connected",
        authoritativeAccess: "available",
        synchronizedAccess: "available",
      }),
    ).toBe("available");
  });

  it("does not render a Private Channel offline", () => {
    expect(
      privateChannelAccessState({
        visibility: "private",
        connection: "disconnected",
        authoritativeAccess: "available",
        synchronizedAccess: "available",
      }),
    ).toBe("offline");
  });

  it("reports access loss as soon as either authoritative or synchronized access is revoked", () => {
    expect(
      privateChannelAccessState({
        visibility: "private",
        connection: "connected",
        authoritativeAccess: "revoked",
        synchronizedAccess: "available",
      }),
    ).toBe("revoked");
    expect(
      privateChannelAccessState({
        visibility: "private",
        connection: "connected",
        authoritativeAccess: "available",
        synchronizedAccess: "revoked",
      }),
    ).toBe("revoked");
  });

  it("does not require synchronized access for a Public Channel", () => {
    expect(
      privateChannelAccessState({
        visibility: "public",
        connection: "disconnected",
        authoritativeAccess: "available",
        synchronizedAccess: "checking",
      }),
    ).toBe("available");
  });

  it("distinguishes access revocation from a transient authorization failure", () => {
    expect(
      authoritativeChannelAccessState({
        error: new TypeError("Network unavailable"),
        isFetching: false,
        isPending: false,
      }),
    ).toBe("checking");
    expect(
      authoritativeChannelAccessState({
        error: new CoveApiError(404, {
          code: "CHANNEL_UNAVAILABLE",
          message: "Channel is unavailable.",
        }),
        isFetching: false,
        isPending: false,
      }),
    ).toBe("revoked");
    expect(
      authoritativeChannelAccessState({
        error: null,
        isFetching: false,
        isPending: false,
      }),
    ).toBe("available");
  });
});
