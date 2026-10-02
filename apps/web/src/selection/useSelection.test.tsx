import { act, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { expect, it, vi } from 'vitest';
import type { GursClient, Parcel } from '../gurs';
import { useSelection } from './useSelection';

it('closing while parcel details load prevents a late URL/fit update', async () => {
  let finish!: (v: any) => void;
  const details = new Promise<any>(r => { finish = r; });
  const client = { findParcel: vi.fn(async () => ({ koId: 999, number: '1' } as Parcel)), parcelDetails: () => details } as unknown as GursClient;
  const { result } = renderHook(() => useSelection(client, 18, true), { wrapper: ({children}) => <MemoryRouter>{children}</MemoryRouter> });
  let pending!: Promise<void>;
  await act(async () => { pending = result.current.doSearch(999, '1'); });
  act(() => result.current.close());
  await act(async () => { finish({}); await pending; });
  expect(result.current.initialKo).toBeUndefined();
  expect(result.current.sel.parcel).toBeNull();
  expect(result.current.fitKey).toBe(0);
});

it('retains manager context through a building visit, then clears it when drawing', async () => {
  const client = { findBuilding: async () => ({ koId: 999, number: 50 }), buildingParts: async () => [] } as unknown as GursClient;
  const { result } = renderHook(() => useSelection(client, 18, true), { wrapper: ({children}) => <MemoryRouter>{children}</MemoryRouter> });
  act(() => result.current.openManager(123, 999));
  await act(async () => { await result.current.showBuilding(999, 50, true); });
  expect(result.current.manager?.id).toBe(123);
  expect(result.current.bld.building?.number).toBe(50);
  expect(result.current.initialBuilding).toBeUndefined();
  act(() => result.current.backToManager());
  expect(result.current.bld.building).toBeNull();
  expect(result.current.manager?.id).toBe(123);
  act(() => result.current.startDraw());
  expect(result.current.manager).toBeNull();
  expect(result.current.draw?.points).toEqual([]);
  act(() => { void result.current.onMapClick(15, 46); void result.current.onMapClick(16, 47); });
  expect(result.current.draw?.points).toHaveLength(2);
});

it('a stale map building miss cannot fall back to a parcel after another navigation', async () => {
  let finish!: (v: null) => void;
  const parcelAt = vi.fn();
  const client = { buildingAt: () => new Promise<null>(r => { finish = r; }), parcelAt } as unknown as GursClient;
  const { result } = renderHook(() => useSelection(client, 18, true), { wrapper: ({children}) => <MemoryRouter>{children}</MemoryRouter> });
  let pending!: Promise<void>;
  act(() => { pending = result.current.onMapClick(15, 46); });
  act(() => result.current.openManager(123));
  await act(async () => { finish(null); await pending; });
  expect(parcelAt).not.toHaveBeenCalled();
  expect(result.current.manager?.id).toBe(123);
});
