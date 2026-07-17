import { EmailAddress, type EmailAddress as EmailAddressType } from "@cove/domain";

export function makeEmailAddress(value: string): EmailAddressType {
  return EmailAddress.make(value);
}
