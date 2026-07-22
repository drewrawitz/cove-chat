export function channelDisplayName(name: string): string {
  const readableName = name.trim().replaceAll(/[-_]+/g, " ");

  return readableName === readableName.toLocaleLowerCase()
    ? readableName.replaceAll(/(^|\s)\p{L}/gu, (character) => character.toLocaleUpperCase())
    : readableName;
}
