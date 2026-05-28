/** Ensure the extension has host permission for a given URL.
 *
 *  Known LLM API domains and localhost are covered by the manifest's
 *  host_permissions. Custom URLs (Backend, Ollama on LAN, OpenAI-compatible)
 *  require an optional permission request via chrome.permissions.request().
 */

/** Convert a URL to an origin pattern suitable for chrome.permissions. */
function toOriginPattern(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.hostname}/*`;
  } catch {
    return url;
  }
}

/** Request host permission for a URL if not already granted.
 *  Returns true if permission was granted (or already existed), false if denied.
 *
 *  IMPORTANT: chrome.permissions.request() must be called from a user gesture
 *  context (click handler). It will fail silently if called from an async chain
 *  without a gesture.
 */
export async function ensureHostPermission(url: string): Promise<boolean> {
  const pattern = toOriginPattern(url);
  const already = await chrome.permissions.contains({ origins: [pattern] });
  if (already) return true;
  return chrome.permissions.request({ origins: [pattern] });
}
