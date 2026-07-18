import { Schema } from "effect";

export const AuthenticationMethod = Schema.Literals(["magic_link", "passkey", "google"]);
export type AuthenticationMethod = typeof AuthenticationMethod.Type;
