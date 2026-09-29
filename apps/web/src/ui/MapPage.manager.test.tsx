import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { MemoryRouter } from "react-router";
import { I18nProvider } from "../i18n";
import { GursContext } from "../gurs/instance";
import { createGursClient, type GursClient, type ManagerPortfolio } from "../gurs";
import { fakeFetch, fixture, typeIs } from "../gurs/testFetch";

vi.mock("../map/MapView", () => ({
  MapView: (p: { selection: { type: string; coordinates: unknown[] } | null }) =>
    <div data-testid="map" data-selected={p.selection ? `${p.selection.type}:${p.selection.coordinates.length}` : "no"} />,
}));
import { MapPage } from "./MapPage";
import { CartContext } from "../cart/useCart";
import { createCartStore } from "../cart/store";

const sq = (x: number) => ({ type: "Polygon" as const, coordinates: [[[x, 46], [x + 0.001, 46], [x + 0.001, 46.001], [x, 46]]] });
const portfolio: ManagerPortfolio = {
  manager: { id: 617, name: "INDOMA d.o.o.", address: "Maribor, Partizanska cesta 13 a", parts: 5 },
  parts: [],
  buildings: [
    { koId: 657, number: 125, eid: "S1", parts: [1, 2, 3].map((n) => ({ koId: 657, building: 125, part: n, eid: `P125-${n}`, buildingEid: "S1", use: "stanovanje" })) },
    { koId: 606, number: 7, eid: "S2", parts: [1, 2].map((n) => ({ koId: 606, building: 7, part: n, eid: `P7-${n}`, buildingEid: "S2", use: "stanovanje" })) },
  ],
};
portfolio.parts = portfolio.buildings.flatMap((b) => b.parts);

let n = 0;
function renderAt(url: string) {
  localStorage.clear();
  const base = createGursClient({ fetch: fakeFetch([[typeIs("SI.GURS.KN:KATASTRSKE_OBCINE"), fixture("ko-page1.json")]]) });
  const calls: { search: string[]; portfolio: number[] } = { search: [], portfolio: [] };
  const client: GursClient = {
    ...base,
    searchManagers: async (q: string) => { calls.search.push(q); return { managers: [{ id: 617, name: "INDOMA d.o.o.", address: "Maribor", parts: 5 }], truncated: false }; },
    managerPortfolio: async (id: number) => { calls.portfolio.push(id); return id === 617 ? portfolio : null; },
    buildingOutlines: async (list) => new Map(list.map((b) => [`${b.koId}:${b.number}`, sq(b.number)])),
    findBuilding: async (ko: number, num: number) => ({ koId: ko, koName: "X", number: num, eid: `S${num}`, geometry: sq(num), type: null, floors: null, year: null, utilities: {} } as never),
    buildingParts: async () => [],
  };
  const cart = createCartStore(`mgr-cart-${++n}`);
  render(
    <MemoryRouter initialEntries={[url]}>
      <MantineProvider><I18nProvider><GursContext.Provider value={client}><CartContext.Provider value={cart}><MapPage /></CartContext.Provider></GursContext.Provider></I18nProvider></MantineProvider>
    </MemoryRouter>,
  );
  return { calls, cart };
}

describe("manager (upravnik) view", () => {
  it("deep link shows the portfolio, highlights all buildings and adds parts to the cart", async () => {
    const { calls, cart } = renderAt("/?upr=617");
    expect(await screen.findByText("INDOMA d.o.o.")).toBeTruthy();
    expect(calls.portfolio).toEqual([617]);
    expect(screen.getByTestId("manager-totals").textContent).toMatch(/2 stavb · 5 delov · 2 KO/);
    await waitFor(() => expect(screen.getByTestId("map").dataset.selected).toBe("MultiPolygon:2"));
    fireEvent.click(screen.getByRole("button", { name: /Dele stavb za izpis ZK \(5\)/ }));
    await waitFor(async () => expect(await cart.count()).toBe(5));
    const items = await cart.list();
    expect(items[0]).toMatchObject({ kind: "part", note: "stanovanje" });
    expect(items.every((i) => i.geometry)).toBe(true);
    // everything already in the cart -> buttons disabled
    await waitFor(() => expect((screen.getByRole("button", { name: /Dele stavb za izpis ZK \(0 \/ 5\)/ }) as HTMLButtonElement).disabled).toBe(true));
  });

  it("KO filter from the deep link limits the list, highlight and cart add", async () => {
    const { cart } = renderAt("/?upr=617&ko=606");
    await screen.findByText("INDOMA d.o.o.");
    await waitFor(() => expect(screen.getByTestId("map").dataset.selected).toBe("MultiPolygon:1"));
    expect(screen.getByTestId("manager-buildings").textContent).not.toMatch(/125/);
    fireEvent.click(screen.getByRole("button", { name: /Stavbe za izpis ZK \(1\)/ }));
    await waitFor(async () => expect(await cart.count()).toBe(1));
    expect((await cart.list())[0]).toMatchObject({ kind: "building", koId: 606, number: "7", eid: "S2" });
  });

  it("search mode finds a manager and opens the panel", async () => {
    const { calls } = renderAt("/");
    fireEvent.click(await screen.findByText("Upravnik"));
    fireEvent.change(screen.getByLabelText("Upravnik stavbe"), { target: { value: "indo" } });
    const opt = await screen.findByText("INDOMA d.o.o.", {}, { timeout: 3000 });
    expect(calls.search).toEqual(["indo"]);
    fireEvent.click(opt);
    await screen.findByTestId("manager-totals");
    expect(calls.portfolio).toEqual([617]);
    await new Promise((r) => setTimeout(r, 900)); // longer than the debounce
    expect(calls.search).toEqual(["indo"]); // picking does not search again
  });

  it("opening a building keeps the manager search and list; back returns without reloading", async () => {
    const { calls } = renderAt("/");
    fireEvent.click(await screen.findByText("Upravnik"));
    fireEvent.change(screen.getByLabelText("Upravnik stavbe"), { target: { value: "indo" } });
    fireEvent.click(await screen.findByText("INDOMA d.o.o.", {}, { timeout: 3000 }));
    await screen.findByTestId("manager-totals");
    fireEvent.click(screen.getByText("Stavba 125"));
    expect(await screen.findByTestId("building-panel")).toBeTruthy();
    expect((screen.getByLabelText("Upravnik stavbe") as HTMLInputElement).value).toBe("INDOMA d.o.o.");
    expect(screen.getByTestId("manager-host").style.display).toBe("none");
    fireEvent.click(screen.getByRole("button", { name: /Nazaj na upravnika/ }));
    await waitFor(() => expect(screen.queryByTestId("building-panel")).toBeNull());
    expect(screen.getByTestId("manager-host").style.display).toBe("");
    expect(screen.getByTestId("manager-totals")).toBeTruthy();
    expect(calls.portfolio).toEqual([617]);
  });

  it("unknown manager shows a friendly message", async () => {
    renderAt("/?upr=5");
    expect(await screen.findByText(/ni evidentiranih delov stavb/)).toBeTruthy();
  });
});
