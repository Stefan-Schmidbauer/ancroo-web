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
  // Call request() directly within the user gesture. If the permission is
  // already granted it resolves true without prompting. An intervening
  // permissions.contains() await would consume the user gesture and make the
  // request() call fail ("must be called during a user gesture").
  return chrome.permissions.request({ origins: [pattern] });
}

/** Request host permissions for a batch of URLs in a single prompt.
 *  Origins already covered by the manifest or a prior grant are included
 *  harmlessly — Chrome only prompts for the ones still missing. Returns true
 *  if every requested origin ends up granted (or there was nothing to ask for).
 *
 *  Must be called within a user gesture (see ensureHostPermission). */
export async function ensureHostPermissions(urls: string[]): Promise<boolean> {
  const origins = [...new Set(urls.filter(Boolean).map(toOriginPattern))];
  if (origins.length === 0) return true;
  return chrome.permissions.request({ origins });
}

/** True if the extension may reach this URL — either granted at runtime or
 *  covered by the manifest's static host_permissions. */
export async function hasHostPermission(url: string): Promise<boolean> {
  return chrome.permissions.contains({ origins: [toOriginPattern(url)] });
}
