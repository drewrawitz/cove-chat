export function isWorkspaceAdministrator(role: string | undefined): boolean {
  return role === "owner" || role === "admin";
}
