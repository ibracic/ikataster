import type { Ko } from "./types";

export const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** KO autocomplete: numeric queries match id prefix (exact first); text matches name prefix, then word prefix, then substring. */
export function searchKos(kos: Ko[], query: string, limit = 20): Ko[] {
  const q = normalize(query);
  if (!q) return [];
  if (/^\d+$/.test(q)) {
    return kos
      .filter((k) => String(k.id).startsWith(q))
      .sort((a, b) => Number(String(b.id) === q) - Number(String(a.id) === q) || a.id - b.id)
      .slice(0, limit);
  }
  const rank = (k: Ko) => {
    const n = normalize(k.name);
    if (n.startsWith(q)) return 0;
    if (n.split(/\s+/).some((w) => w.startsWith(q))) return 1;
    if (n.includes(q)) return 2;
    return -1;
  };
  return kos
    .map((k) => [k, rank(k)] as const)
    .filter(([, r]) => r >= 0)
    .sort((a, b) => a[1] - b[1] || a[0].name.localeCompare(b[0].name, "sl"))
    .map(([k]) => k)
    .slice(0, limit);
}
