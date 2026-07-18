export interface PendingCommand {
  readonly commandId: string;
  readonly inputFingerprint: string;
}

export const retainCommandId = (
  pending: PendingCommand | undefined,
  inputFingerprint: string,
  makeCommandId: () => string = () => globalThis.crypto.randomUUID(),
): PendingCommand =>
  pending?.inputFingerprint === inputFingerprint
    ? pending
    : { commandId: makeCommandId(), inputFingerprint };

export const releaseCommandId = (
  pending: PendingCommand | undefined,
  completedCommandId: string,
): PendingCommand | undefined => (pending?.commandId === completedCommandId ? undefined : pending);
