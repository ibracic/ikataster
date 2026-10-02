import { describe, expect, it } from 'vitest';
import { belongsTo, mapIdentity, propertyKey } from './identity';
import { itemKey } from '../cart/store';
import { resultKey } from '../ezk/results';
import type { EzkExtract } from '../ezk/types';

describe('property identity', () => {
  it.each(['parcel', 'building', 'part'] as const)('preserves persisted %s keys across list and extracts', kind => {
    const p = { kind, koId: 999, number: kind === 'parcel' ? '100/1' : '50', part: 21 };
    const expected = `${kind}:999:${p.number}${kind === 'part' ? ':21' : ''}`;
    expect(propertyKey(p)).toBe(expected);
    expect(itemKey(p)).toBe(expected);
    expect(resultKey({ property: { ...p, type: kind } } as unknown as EzkExtract)).toBe(expected);
  });
  it('groups parts onto buildings without matching parcels or other KOs', () => {
    const part = { kind: 'part' as const, koId: 999, number: '50', part: 21 };
    const building = mapIdentity(part);
    expect(propertyKey(building)).toBe('building:999:50');
    expect(belongsTo(part, building)).toBe(true);
    expect(belongsTo({ ...part, kind: 'parcel' }, building)).toBe(false);
    expect(belongsTo({ ...part, koId: 998 }, building)).toBe(false);
    expect(belongsTo({ ...part, part: 22 }, part)).toBe(false);
    expect(belongsTo({ ...part, number: 50 }, part)).toBe(true);
  });
});
