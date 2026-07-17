import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";
import {
  CsrfValidationFailedResponse,
  InternalServerErrorResponse,
  InvalidMagicLinkResponse,
  UnauthorizedResponse,
} from "./auth-error-response.ts";
import { MagicLinkAcceptedResponse } from "./auth-response.ts";
import { CurrentUserResponse } from "./current-user-response.ts";
import { LoginRequest } from "./login-request.ts";
import { LogoutHeaders } from "./logout-headers.ts";
import { SessionAuth } from "./session-auth.ts";
import { VerifyMagicLinkRequest } from "./verify-magic-link-request.ts";

const LoginEndpoint = HttpApiEndpoint.post("login", "/api/v1/auth/login", {
  payload: LoginRequest,
  success: MagicLinkAcceptedResponse,
  error: InternalServerErrorResponse,
});

const VerifyMagicLinkEndpoint = HttpApiEndpoint.post(
  "verifyMagicLink",
  "/api/v1/auth/login/verify",
  {
    payload: VerifyMagicLinkRequest,
    success: CurrentUserResponse,
    error: [InvalidMagicLinkResponse, InternalServerErrorResponse],
  },
);

const MeEndpoint = HttpApiEndpoint.get("me", "/api/v1/me", {
  success: CurrentUserResponse,
  error: [UnauthorizedResponse, InternalServerErrorResponse],
}).middleware(SessionAuth);

const LogoutEndpoint = HttpApiEndpoint.post("logout", "/api/v1/auth/logout", {
  headers: LogoutHeaders,
  error: [CsrfValidationFailedResponse, InternalServerErrorResponse],
}).middleware(SessionAuth);

export const AuthApiGroup = HttpApiGroup.make("auth").add(
  LoginEndpoint,
  VerifyMagicLinkEndpoint,
  LogoutEndpoint,
  MeEndpoint,
);
