/** Persisted identity format. Do not normalize numbers: existing keys must stay stable. */
export type PropertyKind = 'parcel' | 'building' | 'part';
export interface PropertyIdentity { kind: PropertyKind; koId: number | undefined; number: string | number | undefined; part?: number }

export function propertyKey(p: PropertyIdentity): string {
  const base = `${p.kind}:${p.koId}:${p.number}`;
  return p.kind === 'part' ? `${base}:${p.part}` : base;
}

/** A building contains itself and its parts, but never a same-number parcel. */
export function belongsTo(candidate: PropertyIdentity, target: PropertyIdentity): boolean {
  if (candidate.koId !== target.koId || String(candidate.number) !== String(target.number)) return false;
  if (target.kind === 'building') return candidate.kind === 'building' || candidate.kind === 'part';
  return candidate.kind === target.kind && (target.kind !== 'part' || candidate.part === target.part);
}

export function mapIdentity(p: PropertyIdentity): PropertyIdentity {
  return p.kind === 'part' ? { kind: 'building', koId: p.koId, number: p.number } : p;
}
