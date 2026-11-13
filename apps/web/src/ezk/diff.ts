/**
 * What changed in the land register between two extracts of the same property:
 * owners in/out, share changes, rights (mortgages, easements, notes) in/out, pending case (plomba).
 */
import type { EzkExtract, Owner, Right } from "./types";

export type ChangeKind =
  | "ownerAdded" | "ownerRemoved" | "shareChanged"
  | "rightAdded" | "rightRemoved"
  | "pendingAdded" | "pendingCleared";

export interface Change { kind: ChangeKind; text: string }

/** Result of re-checking a property: when, against which earlier extract, and what changed. */
export interface ExtractChanges { checkedAt: number; previousCreatedAt?: string; items: Change[] }

const norm = (s: string) => s.trim().toUpperCase().replace(/\s+/g, " ");
const ownerId = (o: Owner) => `${norm(o.holder.name)}|${norm(o.right)}`;
const rightLabel = (r: Right) => {
  const amount = r.charge?.amount != null ? ` ${new Intl.NumberFormat("sl-SI").format(r.charge.amount)} ${r.charge.currency ?? "EUR"}` : "";
  return `${r.type}${amount}`;
};
const rightId = (r: Right) => `${r.id}`;

export function diffExtracts(prev: EzkExtract, next: EzkExtract): Change[] {
  const out: Change[] = [];
  const before = new Map(prev.owners.map((o) => [ownerId(o), o]));
  const after = new Map(next.owners.map((o) => [ownerId(o), o]));
  for (const [k, o] of before) if (!after.has(k)) out.push({ kind: "ownerRemoved", text: `${o.holder.name} (${o.share})` });
  for (const [k, o] of after) if (!before.has(k)) out.push({ kind: "ownerAdded", text: `${o.holder.name} (${o.share})` });
  for (const [k, o] of after) {
    const p = before.get(k);
    if (p && p.share !== o.share) out.push({ kind: "shareChanged", text: `${o.holder.name}: ${p.share} → ${o.share}` });
  }
  const rb = new Map((prev.rights ?? []).map((r) => [rightId(r), r]));
  const ra = new Map((next.rights ?? []).map((r) => [rightId(r), r]));
  for (const [k, r] of rb) if (!ra.has(k)) out.push({ kind: "rightRemoved", text: rightLabel(r) });
  for (const [k, r] of ra) if (!rb.has(k)) out.push({ kind: "rightAdded", text: rightLabel(r) });
  if (!prev.pending && next.pending) out.push({ kind: "pendingAdded", text: "" });
  if (prev.pending && !next.pending) out.push({ kind: "pendingCleared", text: "" });
  return out;
}
