import { CurrentUserResponse } from "@cove/protocol";

interface CurrentUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
}

export function currentUserResponse(user: CurrentUser): CurrentUserResponse {
  return CurrentUserResponse.make({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
  });
}
