export type AppLink = { kind: 'donation' | 'volunteer' | 'driver'; id: string };
export function parseAppLink(kind: unknown, id: unknown): AppLink | null {
  if (!['donation','volunteer','driver'].includes(String(kind)) || typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return null;
  return { kind: kind as AppLink['kind'], id };
}
export function linkRole(link: AppLink) { return link.kind === 'donation' ? 'donor' : link.kind; }
export function linkDestination(link: AppLink) {
  return link.kind === 'donation' ? `/donor/request/${link.id}` : link.kind === 'volunteer' ? `/volunteer/assignment/${link.id}` : `/driver/job/${link.id}`;
}
export const PENDING_LINK = 'aaharaconnect-pending-object-link-v1';
