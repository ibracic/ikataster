import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import type { FeatureCollection, Geometry } from "geojson";
import type { Address, GursClient } from "../gurs";
import { useParcelSelection } from "../features/parcel/useParcelSelection";
import { useBuildingSelection } from "../features/building/useBuildingSelection";
export type Mode = "address" | "parcel" | "building" | "manager";
const CLICK_MIN_ZOOM = 15;
const BUILDING_CLICK_ZOOM = 17;

/** Owns navigation transitions, URL updates and the manager return context. */
export function useSelection(client: GursClient, zoom: number, buildings: boolean) {
  const sel = useParcelSelection(client);
  const bld = useBuildingSelection(client);
  const generation = useRef(0);
  const begin = () => { generation.current++; sel.clear(); bld.clear(); return generation.current; };
  useEffect(() => () => { generation.current++; }, []);
  const [params, setParams] = useSearchParams();
  const [fitKey, setFitKey] = useState(0);
  const [draw, setDraw] = useState<{ points: [number, number][]; done: boolean } | null>(null);
  const startDraw = () => { begin(); setManager(null); setManagerGeom(null); setParams({}, { replace: true }); setDraw({ points: [], done: false }); };
  const [mode, setMode] = useState<Mode>(() => (params.get("upr") ? "manager" : params.get("st") ? "building" : params.get("ko") ? "parcel" : "address"));
  /** Manager (upravnik) view: id + optional KO filter, deep link ?upr=617&ko=657. */
  const [manager, setManager] = useState<{ id: number; ko: number | null } | null>(() => {
    const id = Number(params.get("upr"));
    return Number.isInteger(id) && id > 0 ? { id, ko: Number(params.get("ko")) || null } : null;
  });
  const [managerGeom, setManagerGeom] = useState<Geometry | null>(null);
  const openManager = (id: number, ko: number | null = null) => {
    begin(); setDraw(null); setMode("manager");
    setManager({ id, ko });
    setParams(ko ? { upr: String(id), ko: String(ko) } : { upr: String(id) }, { replace: true });
  };
  const [managerPts, setManagerPts] = useState<FeatureCollection | null>(null);
  const onManagerHighlight = useCallback((g: Geometry | null, pts?: FeatureCollection | null) => { setManagerGeom(g); setManagerPts(pts ?? null); if (g) setFitKey((k) => k + 1); }, []);

  const initialKo = Number(params.get("ko")) || undefined;
  const initialParcel = params.get("p") ?? undefined;
  const initialBuilding = params.get("st") ?? undefined;

  /** `fromManager`: open on top of the manager list, which stays loaded (search, filter, scroll). */
  const showBuilding = async (ko: number, st: number, fromManager = false) => {
    const token = begin(); setDraw(null);
    if (!fromManager) { setManager(null); setManagerGeom(null); }
    const b = await bld.search(ko, st);
    if (b && token === generation.current) {
      if (!fromManager) setParams({ ko: String(b.koId), st: String(b.number) }, { replace: true });
      setFitKey((k) => k + 1);
    }
  };
  const backToManager = () => { begin(); setFitKey((k) => k + 1); };

  const doSearch = async (ko: number, p: string) => {
    const token = begin(); setDraw(null); setManager(null); setManagerGeom(null);
    const found = await sel.search(ko, p);
    if (found && token === generation.current) {
      setParams({ ko: String(found.koId), p: found.number }, { replace: true });
      setFitKey((k) => k + 1);
    }
  };

  // deep link: /?ko=657&p=1587
  useEffect(() => {
    if (manager) return;
    if (initialKo && initialBuilding) void showBuilding(initialKo, Number(initialBuilding));
    else if (initialKo && initialParcel) void doSearch(initialKo, initialParcel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onAddress = async (a: Address) => {
    const token = begin(); setDraw(null); setManager(null); setManagerGeom(null);
    const found = await sel.pickAddress(a.e, a.n);
    if (found && token === generation.current) {
      setParams({ ko: String(found.koId), p: found.number }, { replace: true });
      setFitKey((k) => k + 1);
    }
  };

  const onMapClick = async (lon: number, lat: number) => {
    if (draw && !draw.done) { setDraw((d) => (d && !d.done ? { ...d, points: [...d.points, [lon, lat]] } : d)); return; }
    if (draw) return;
    if (zoom < CLICK_MIN_ZOOM) return;
    const token = begin(); setManager(null); setManagerGeom(null);
    if (zoom >= BUILDING_CLICK_ZOOM && buildings) {
      const b = await bld.pick(lon, lat);
      if (token !== generation.current) return;
      if (b) {
        sel.clear();
        setParams({ ko: String(b.koId), st: String(b.number) }, { replace: true });
        return;
      }
    }
    bld.clear();
    const found = await sel.pick(lon, lat);
    if (found && token === generation.current) setParams({ ko: String(found.koId), p: found.number }, { replace: true });
  };

  const close = () => { begin(); setDraw(null); setManager(null); setManagerGeom(null); setParams({}, { replace: true }); };

  const openProperty = (kind: "parcel" | "building" | "part", ko: number, number: string) => {
    setMode(kind === "parcel" ? "parcel" : "building");
    return kind === "parcel" ? doSearch(ko, number) : showBuilding(ko, Number(number));
  };

  return { openProperty, sel, bld, draw, setDraw, startDraw, mode, setMode, manager, managerGeom, managerPts,
    fitKey, initialKo, initialParcel, initialBuilding, openManager, onManagerHighlight,
    showBuilding, backToManager, doSearch, onAddress, onMapClick, close };
}
