/**
 * pickerItems — pure rendering function for the version picker UI.
 *
 * Kept VS Code-free so it can be unit-tested under plain Mocha.
 */

export interface PickerItem {
  label: string;
  description?: string;
  detail?: string;
  /** Internal: marks the special "Show all" entry. */
  showAll?: boolean;
}

const RECENT_LIMIT = 5;

/**
 * buildPickerItems returns the items to render in the quick-pick.
 *
 * - filter === ""  → up to RECENT_LIMIT items (sorted as supplied) + "Show all"
 *                    entry when more exist.
 * - filter !== ""  → all versions whose label contains filter (case-insensitive).
 *                    "Show all" entry is hidden while filtering.
 */
export function buildPickerItems(
  versions: string[],
  current: string | undefined,
  filter: string,
): PickerItem[] {
  if (filter.trim() === "") {
    const head: PickerItem[] = versions.slice(0, RECENT_LIMIT).map((v, i) => ({
      label: v,
      description: descriptionFor(v, current, i === 0),
    }));
    if (versions.length > RECENT_LIMIT) {
      head.push({ label: `Show all ${versions.length} versions…`, showAll: true });
    }
    return head;
  }
  const needle = filter.toLowerCase();
  return versions
    .filter((v) => v.toLowerCase().includes(needle))
    .map((v) => ({ label: v, description: descriptionFor(v, current, false) }));
}

function descriptionFor(
  version: string,
  current: string | undefined,
  isFirst: boolean,
): string | undefined {
  const parts: string[] = [];
  if (isFirst) parts.push("latest");
  if (version === current) parts.push("current");
  return parts.length ? parts.join(" · ") : undefined;
}
