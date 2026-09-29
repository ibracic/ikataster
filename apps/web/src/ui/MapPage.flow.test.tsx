import { render, screen, within, fireEvent } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { MemoryRouter } from "react-router";
import { I18nProvider } from "../i18n";
import { GursContext } from "../gurs/instance";
import { createGursClient } from "../gurs";
import { fromD96 } from "../gurs";
import { act } from "@testing-library/react";
import { fakeFetch, fixture, typeIs, type Route } from "../gurs/testFetch";

vi.mock("../map/MapView", () => ({
  MapView: (p: { selection: unknown; onMapClick?: (lon: number, lat: number) => void; draft?: unknown[] | null }) => {
    (globalThis as { __mapClick?: typeof p.onMapClick }).__mapClick = p.onMapClick;
    return <div data-testid="map" data-selected={p.selection ? "yes" : "no"} data-draft={p.draft ? p.draft.length : "none"} />;
  },
}));
import { MapPage } from "./MapPage";
import { CartContext } from "../cart/useCart";
import { createCartStore } from "../cart/store";
import { createValues, ValuesContext } from "../values";
import { TxContext, type Transactions } from "../transactions";
const fakeTx: Transactions = { get: async () => null, count: async () => 0, clear: async () => {} };

const fakeValues = () => createValues({
  name: `flow-values-${Math.random()}`, base: "https://data.example",
  fetch: (async () => new Response(JSON.stringify({ date: "2026-09-26", p: { "1587": 123456 }, d: {} }))) as unknown as typeof fetch,
});

let cartN = 0;

const routes = (parcel = "parcel-657-1587.json"): Route[] => [
  [(u) => u.pathname === "/jv-api/search", fixture("addr-koroska.json")],
  [typeIs("SI.GURS.KN:KATASTRSKE_OBCINE"), fixture("ko-page1.json")],
  [typeIs("SI.GURS.KN:PARCELE"), fixture(parcel)],
  [typeIs("SI.GURS.KN:DEJANSKE_RABE"), fixture("raba.json")],
  [typeIs("SI.GURS.KN:NAMENSKE_RABE"), fixture("namenska.json")],
  [typeIs("SI.GURS.KN:STAVBE_PARCELE"), fixture("stavbe-parcele.json")],
  [typeIs("SI.MNVP.PA:EUP_OPN"), fixture("eup.json")],
];

function renderAt(url: string, r: Route[], cart = createCartStore(`flow-cart-${++cartN}`)) {
  window.matchMedia ||= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as never;
  globalThis.ResizeObserver ||= class { observe() {} unobserve() {} disconnect() {} } as never;
  localStorage.clear();
  const client = createGursClient({ fetch: fakeFetch(r) });
  return render(
    <MemoryRouter initialEntries={[url]}>
      <MantineProvider><I18nProvider><GursContext.Provider value={client}><CartContext.Provider value={cart}><ValuesContext.Provider value={fakeValues()}><TxContext.Provider value={fakeTx}><MapPage /></TxContext.Provider></ValuesContext.Provider></CartContext.Provider></GursContext.Provider></I18nProvider></MantineProvider>
    </MemoryRouter>,
  );
}

describe("parcel search flow", () => {
  it("deep link ?ko=657&p=1587 highlights the parcel and shows its details", async () => {
    renderAt("/?ko=657&p=1587", routes());
    const panel = await screen.findByTestId("parcel-panel");
    expect(within(panel).getByRole("heading", { name: "1587" })).toBeInTheDocument();
    expect(within(panel).getByText(/657 MARIBOR GRAD/)).toBeInTheDocument();
    expect(within(panel).getByText(/^1[.\s\u00a0]?011 m²$/)).toBeInTheDocument();
    expect(await within(panel).findByText("RT-72")).toBeInTheDocument();
    expect(within(panel).getByText("Hkratna raba zemljišča")).toBeInTheDocument();
    expect(within(panel).getByText("Osrednja območja centralnih dejavnosti")).toBeInTheDocument();
    expect(within(panel).getByText("Stavba 1879")).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: /javnem vpogledu/ })).toHaveAttribute("href", "https://ipi.eprostor.gov.si/jv/?eid=100100000222153246");
    expect((await within(panel).findByRole("link", { name: /Posplošena vrednost: 123[.\s\u00a0]456/ })).getAttribute("href")).toMatch(/^https:\/\/vrednotenje\.gov\.si\/EV_JV\/#\/parcela_\d+$/);
    expect(screen.getByTestId("map")).toHaveAttribute("data-selected", "yes");
  });

  it("shows a friendly message when the parcel does not exist", async () => {
    renderAt("/?ko=657&p=999999", routes("parcel-empty.json"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Parcele ni v katastru");
    expect(screen.queryByTestId("parcel-panel")).not.toBeInTheDocument();
  });

  it("shows a friendly message when GURS is down", async () => {
    renderAt("/?ko=657&p=1587", [[() => true, () => new Response("down", { status: 503 })]]);
    expect(await screen.findByRole("alert")).toHaveTextContent("GURS je vrnil napako");
  });

  it("shows a cached-data badge with age when GURS answers from the offline cache", async () => {
    const { resetCacheStatus } = await import("../sw/cacheStatus");
    resetCacheStatus();
    const stored = Date.now() - 3 * 3600_000;
    const cachedRoutes: Route[] = routes().map(([m, b]) => [m, () => new Response(b as string, { headers: { "content-type": "application/json", "X-Ikataster-Cached": String(stored) } })]);
    renderAt("/?ko=657&p=1587", cachedRoutes);
    const panel = await screen.findByTestId("parcel-panel");
    expect(await within(panel).findByTestId("cached-badge")).toHaveTextContent("Shranjeni podatki · 3 h");
    resetCacheStatus();
  });

  it("closes the panel", async () => {
    renderAt("/?ko=657&p=1587", routes());
    const panel = await screen.findByTestId("parcel-panel");
    fireEvent.click(within(panel).getByRole("button", { name: "Zapri" }));
    expect(screen.queryByTestId("parcel-panel")).not.toBeInTheDocument();
    expect(screen.getByTestId("map")).toHaveAttribute("data-selected", "no");
  });
});

describe("address search flow", () => {
  it("defaults to address mode, autocompletes and opens the parcel under the chosen address", async () => {
    renderAt("/", routes());
    const input = screen.getByRole("textbox", { name: "Naslov" });
    fireEvent.change(input, { target: { value: "Koroška cesta 5" } });
    const opt = await screen.findByText("4260 Bled", {}, { timeout: 2000 });
    fireEvent.click(opt);
    const panel = await screen.findByTestId("parcel-panel");
    expect(within(panel).getByRole("heading", { name: "1587" })).toBeInTheDocument();
    expect(screen.getByTestId("map")).toHaveAttribute("data-selected", "yes");
  });

  it("keeps the suggestion list open and scrollable when the input loses focus (mobile scroll)", async () => {
    renderAt("/", routes());
    const input = screen.getByRole("textbox", { name: "Naslov" });
    fireEvent.change(input, { target: { value: "Koroška cesta 5" } });
    const opt = await screen.findByText("4260 Bled", {}, { timeout: 2000 });
    // iOS: touching/scrolling the list blurs the input (keyboard hides) – list must stay
    expect(input).toHaveAttribute("data-expanded", "true");
    fireEvent.blur(input);
    await new Promise((r) => setTimeout(r, 50));
    expect(input).toHaveAttribute("data-expanded", "true");
    expect(screen.getByText("4260 Bled")).toBeInTheDocument();
    // list scrolls inside itself, bounded to the viewport, without chaining to the page
    const scroller = screen.getByTestId("address-options");
    expect(scroller.contains(opt)).toBe(true);
    expect(scroller.style.maxHeight).toMatch(/dvh|vh|px/);
    expect(scroller.style.overscrollBehavior).toBe("contain");
  });

  it("tells the user when GURS has no matching address", async () => {
    const r = routes();
    r[0] = [(u) => u.pathname === "/jv-api/search", fixture("addr-empty.json")];
    renderAt("/", r);
    fireEvent.change(screen.getByRole("textbox", { name: "Naslov" }), { target: { value: "Celovška cesta 99999" } });
    expect(await screen.findByText(/Ni zadetka v registru GURS/, {}, { timeout: 2000 })).toBeInTheDocument();
  });

  it("switches to parcel mode", () => {
    renderAt("/", routes());
    fireEvent.click(screen.getByRole("radio", { name: "Parcela" }));
    expect(screen.getByRole("textbox", { name: "Št. parcele" })).toBeInTheDocument();
  });
});

const bldRoutes = (): Route[] => [
  ...routes(),
  [typeIs("SI.GURS.KN:STAVBE"), fixture("bld-attrs.json")],
  [typeIs("SI.GURS.KN:STAVBE_OBRIS"), fixture("bld-obris.json")],
  [typeIs("SI.GURS.KN:DELI_STAVB"), fixture("bld-parts.json")],
];

describe("building flow", () => {
  it("deep link ?ko=657&st=130 shows the building with its parts", async () => {
    renderAt("/?ko=657&st=130", bldRoutes());
    const panel = await screen.findByTestId("building-panel");
    expect(within(panel).getByRole("heading", { name: "130" })).toBeInTheDocument();
    expect(within(panel).getByText("krajna vrstna stavba")).toBeInTheDocument();
    expect(within(panel).getByText("1949")).toBeInTheDocument();
    const table = await within(panel).findByTestId("parts-table");
    expect(within(panel).getByText(/Deli stavbe \(61\)/)).toBeInTheDocument();
    expect(within(table).getAllByText("stanovanje").length).toBeGreaterThan(10);
    expect(screen.getByTestId("map")).toHaveAttribute("data-selected", "yes");
    expect(screen.getByRole("radio", { name: "Stavba" })).toBeChecked();
  });

  it("opens a building from the parcel panel badge", async () => {
    renderAt("/?ko=657&p=1587", bldRoutes());
    const panel = await screen.findByTestId("parcel-panel");
    fireEvent.click(await within(panel).findByRole("button", { name: "Stavba 1879" }));
    expect(await screen.findByTestId("building-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("parcel-panel")).not.toBeInTheDocument();
  });

  it("reports a missing building", async () => {
    renderAt("/?ko=657&st=99999999", [[() => true, fixture("bld-empty.json")]]);
    expect(await screen.findByRole("alert")).toHaveTextContent("Stavbe ni v katastru");
  });
});

describe("cart flow", () => {
  it("adds a parcel once, shows the count and survives a remount", async () => {
    const cart = createCartStore(`flow-cart-persist-${Date.now()}`);
    const view = renderAt("/?ko=657&p=1587", routes(), cart);
    const panel = await screen.findByTestId("parcel-panel");
    fireEvent.click(within(panel).getByRole("button", { name: "Dodaj za izpis ZK" }));
    expect(await within(panel).findByRole("button", { name: "Na seznamu za izpis ZK" })).toBeDisabled();
    expect(await screen.findByTestId("cart-count")).toHaveTextContent("1");
    view.unmount();
    renderAt("/", routes(), cart);
    expect(await screen.findByTestId("cart-count")).toHaveTextContent("1");
  });

  it("adds a building and selected parts, then removes and clears in the drawer", async () => {
    renderAt("/?ko=657&st=130", bldRoutes());
    const panel = await screen.findByTestId("building-panel");
    await within(panel).findByTestId("parts-table");
    fireEvent.click(within(panel).getByRole("checkbox", { name: "Del stavbe 2" }));
    fireEvent.click(within(panel).getByRole("checkbox", { name: "Del stavbe 3" }));
    fireEvent.click(within(panel).getByRole("button", { name: "Dodaj izbrane dele (2)" }));
    fireEvent.click(within(panel).getByRole("button", { name: "Dodaj za izpis ZK" }));
    expect(await screen.findByTestId("cart-count")).toHaveTextContent("3");
    expect(await within(panel).findByRole("checkbox", { name: "Na seznamu za izpis ZK 2" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Seznam za izpise ZK (3)" }));
    const list = await screen.findByTestId("cart-list");
    expect(within(list).getByText("Stavba 130")).toBeInTheDocument();
    expect(within(list).getByText("Del stavbe 130/2")).toBeInTheDocument();
    fireEvent.click(within(list).getByRole("button", { name: "Odstrani Del stavbe 130/2" }));
    await within(list).findByText("Del stavbe 130/3");
    expect(await screen.findByTestId("cart-count")).toHaveTextContent("2");
    fireEvent.click(within(list).getByRole("button", { name: "Izprazni seznam" }));
    fireEvent.click(within(list).getByRole("button", { name: "Res izprazni?" }));
    expect(await screen.findByText(/Seznam je prazen/)).toBeInTheDocument();
  });
});

describe("area selection flow", () => {
  const tap = async (e: number, n: number) => {
    const [lon, lat] = fromD96(e, n);
    await act(async () => { await (globalThis as { __mapClick?: (a: number, b: number) => Promise<void> }).__mapClick?.(lon, lat); });
  };
  const areaRoutes = (): Route[] => [
    [typeIs("SI.GURS.KN:KATASTRSKE_OBCINE"), fixture("ko-page1.json")],
    [typeIs("SI.GURS.KN:PARCELE"), fixture("poly-parcels.json")],
    [typeIs("SI.GURS.KN:STAVBE_OBRIS"), fixture("poly-buildings.json")],
  ];

  it("draws a polygon, previews the count, switches to buildings and adds them to the cart", async () => {
    renderAt("/", areaRoutes());
    fireEvent.click(screen.getByRole("button", { name: "Izberi območje" }));
    const bar = await screen.findByTestId("draw-toolbar");
    expect(within(bar).getByRole("button", { name: "Zaključi" })).toBeDisabled();
    // rapid taps within one tick must all register
    await act(async () => {
      const click = (globalThis as { __mapClick?: (a: number, b: number) => void }).__mapClick!;
      for (const [e, n] of [[550000, 157900], [550180, 157900], [550180, 158040], [550000, 158040]]) click(...fromD96(e, n));
    });
    expect(screen.getByTestId("map")).toHaveAttribute("data-draft", "4");
    fireEvent.click(within(bar).getByRole("button", { name: "Razveljavi" }));
    expect(screen.getByTestId("map")).toHaveAttribute("data-draft", "3");
    await tap(550000, 158040);
    fireEvent.click(within(bar).getByRole("button", { name: "Zaključi" }));

    const panel = await screen.findByTestId("area-panel");
    expect(await within(panel).findByTestId("area-count")).toHaveTextContent(/V območju: \d+ parcel/);
    fireEvent.click(within(panel).getByRole("radio", { name: "Stavbe" }));
    const count = await within(panel).findByTestId("area-count");
    expect(count).toHaveTextContent(/stavb/);
    const n = Number(count.textContent!.match(/(\d+)/)![1]);
    fireEvent.click(within(panel).getByRole("button", { name: `Dodaj za izpis ZK (${n})` }));
    expect(await screen.findByTestId("cart-count")).toHaveTextContent(String(n));
    expect(await within(panel).findByRole("button", { name: `Dodano na seznam za izpise ZK (${n})` })).toBeDisabled();
  });

  it("warns when the area is too large", async () => {
    const big = JSON.parse(fixture("poly-parcels.json")); big.numberMatched = 5000;
    renderAt("/", [[typeIs("SI.GURS.KN:KATASTRSKE_OBCINE"), fixture("ko-page1.json")], [() => true, JSON.stringify(big)]]);
    fireEvent.click(screen.getByRole("button", { name: "Izberi območje" }));
    await tap(550000, 157900); await tap(560000, 157900); await tap(560000, 160000);
    fireEvent.click(within(await screen.findByTestId("draw-toolbar")).getByRole("button", { name: "Zaključi" }));
    expect(await within(await screen.findByTestId("area-panel")).findByRole("alert")).toHaveTextContent("5000");
  });
});

const KO_657 = JSON.stringify({ type: "FeatureCollection", numberMatched: 1, features: [{ type: "Feature", properties: { KO_ID: 657, NAZIV: "MARIBOR GRAD" }, geometry: null }] });

describe("list import flow", () => {
  it("pastes a list, adds valid rows to the cart and reports invalid rows with reasons", async () => {
    renderAt("/", [
      [typeIs("SI.GURS.KN:KATASTRSKE_OBCINE"), KO_657],
      [typeIs("SI.GURS.KN:PARCELE"), fixture("imp-parcels-657.json")],
      [typeIs("SI.GURS.KN:STAVBE_OBRIS"), fixture("imp-buildings-657.json")],
      [typeIs("SI.GURS.KN:DELI_STAVB"), fixture("imp-parts-657.json")],
    ]);
    fireEvent.click(screen.getByRole("button", { name: /^Seznam za izpise ZK/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Uvozi seznam" }));
    const box = await screen.findByRole("textbox", { name: "Seznam" });
    fireEvent.change(box, { target: { value: "KO;Parcela\n657;1587\n657;999999\n657 st:130\n657 del:130/2\nfoo\n" } });
    const run = screen.getByRole("button", { name: "Preveri in dodaj" });
    await vi.waitFor(() => expect(run).toBeEnabled()); // KO list loaded
    fireEvent.click(run);

    const result = await screen.findByTestId("import-result");
    expect(result).toHaveTextContent("Dodano na seznam za izpise ZK: 3");
    expect(result).toHaveTextContent("Neveljavne vrstice: 2");
    const invalid = within(result).getByTestId("import-invalid");
    expect(within(invalid).getByText("Ni v katastru")).toBeInTheDocument();
    expect(within(invalid).getByText("Nerazumljiva vrstica")).toBeInTheDocument();
    expect(within(invalid).getByText("3")).toBeInTheDocument(); // source line of 657;999999
    expect(await screen.findByTestId("cart-count")).toHaveTextContent("3");
  });
});
