import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { renderHook } from "@testing-library/react";
import { resultTargets, resultsFor, useResultPoints } from "./points";
import { PropertyResults } from "./PropertyResults";
import { OwnerLine } from "./ResultCard";
import { ResultsContext } from "./useResults";
import { createResultsStore, type ResultRecord } from "./results";
import type { EzkExtract } from "./types";
import { I18nProvider } from "../i18n";
import type { GursClient } from "../gurs";

const ex = (type: "parcel" | "building" | "part", ko: number, number: string, part?: number, owner = "JANEZ VZOREC"): EzkExtract => ({
  kind: "current", createdAt: "2026-10-01", pending: false,
  property: { type, koId: ko, koName: "VZORČNA VAS", number, part, label: `${ko} ${number}${part ? `/${part}` : ""}` },
  owners: [{ positionId: 1, right: "lastninska pravica", share: "1/1", holder: { kind: "person", name: owner, address: "Testna 1" }, restrictions: [] }],
  rights: [], benefits: [],
} as unknown as EzkExtract);
const rec = (x: EzkExtract, key: string): ResultRecord => ({ key, fileName: "a.pdf", addedAt: 1, extract: x });

describe("eZK results on the map and in panels", () => {
  const records = [
    rec(ex("parcel", 999, "100/1"), "parcel:999:100/1"),
    rec(ex("part", 999, "50", 1), "part:999:50:1"),
    rec(ex("part", 999, "50", 2), "part:999:50:2"),
    rec(ex("building", 998, "7"), "building:998:7"),
  ];

  it("groups parts into their building and matches property results", () => {
    expect(resultTargets(records)).toEqual([
      { kind: "parcel", ko: 999, n: "100/1", count: 1 },
      { kind: "building", ko: 999, n: "50", count: 2 },
      { kind: "building", ko: 998, n: "7", count: 1 },
    ]);
    expect(resultsFor(records, "building", 999, 50).map((r) => r.key)).toEqual(["part:999:50:1", "part:999:50:2"]);
    expect(resultsFor(records, "part", 999, 50, 2).map((r) => r.key)).toEqual(["part:999:50:2"]);
    expect(resultsFor(records, "parcel", 999, "100/1")).toHaveLength(1);
    expect(resultsFor(records, "parcel", 999, "100/2")).toHaveLength(0);
  });

  it("places one marker per parcel/building at the centre of its outline", async () => {
    const sq = (x: number) => ({ type: "Polygon", coordinates: [[[x, 46], [x + 2, 46], [x + 2, 48], [x, 48], [x, 46]]] });
    const client = {
      findParcel: async () => ({ geometry: sq(14) }),
      findBuilding: async (ko: number) => (ko === 999 ? { geometry: sq(15) } : null),
    } as unknown as GursClient;
    const { result } = renderHook(() => useResultPoints(records, client));
    await waitFor(() => expect(result.current?.features).toHaveLength(2));
    expect(result.current!.features.map((f) => [f.properties, f.geometry.coordinates])).toEqual([
      [{ kind: "parcel", ko: 999, n: "100/1", count: 1 }, [15, 47]],
      [{ kind: "building", ko: 999, n: "50", count: 2 }, [16, 47]],
    ]);
  });

  it("shows stored extracts with owners in the property panel", async () => {
    const store = createResultsStore(`t-${Math.random()}`);
    await store.put(ex("parcel", 999, "100/1", undefined, "MARIJA PRIMER"), "a.pdf");
    render(<MantineProvider><I18nProvider><ResultsContext.Provider value={store}>
      <PropertyResults kind="parcel" ko={999} n="100/1" defaultOpen />
      <div data-testid="other"><PropertyResults kind="parcel" ko={999} n="5" /></div>
    </ResultsContext.Provider></I18nProvider></MantineProvider>);
    await waitFor(() => expect(screen.getByTestId("property-results")).toBeTruthy());
    expect(screen.getAllByText(/MARIJA PRIMER/).length).toBeGreaterThan(0);
    expect(screen.getByTestId("other").textContent).toBe("");
  });

  it("summarises owners and mortgages in one line for a part row", () => {
    const x = ex("part", 999, "50", 1, "ANA PRIMER");
    (x as { rights: unknown[] }).rights = [{ id: 1, category: "mortgage", type: "hipoteka", positionIds: [], holders: [], secondary: [] }];
    render(<MantineProvider><I18nProvider><OwnerLine record={rec(x, "part:999:50:1")} /></I18nProvider></MantineProvider>);
    expect(screen.getByTestId("part-owner").textContent).toBe("HANA PRIMER 1/1");
  });
});
