/** Bound native external input before Expo Router's legacy query-string decoder.
 * Our object links contain ASCII paths and UUIDs, with no encoded parameters.
 * Internal navigation and browser email invitation/password flows are unaffected.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  if (typeof path !== 'string' || !path || path.length > 512 || path.includes('%') || !/^[\x20-\x7e]+$/.test(path)) return '/';
  return path;
}
