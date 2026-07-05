/** Turn a display name into a storage slug.
 *
 *  `fallback` guards against names made only of symbols/emoji (or non-Latin
 *  scripts) collapsing to an empty slug — stored entries are upserted by this
 *  value, so two empty slugs would silently overwrite each other.
 */
export function slugify(name: string, fallback: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || fallback
  );
}
