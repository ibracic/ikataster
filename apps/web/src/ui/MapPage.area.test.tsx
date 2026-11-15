import { screen, within, fireEvent, act } from "@testing-library/react";
import { fromD96 } from "../gurs";
import { testCadastre } from "../test/cadastre";
import { renderAt, cartCount } from "../test/renderMap";

vi.mock("../map/MapView", () => ({
  MapView: (p: { selection: unknown; onMapClick?: (lon: number, lat: number) => void; draft?: unknown[] | null }) => {
    (globalThis as { __mapClick?: typeof p.onMapClick }).__mapClick = p.onMapClick;
    return <div data-testid="map" data-selected={p.selection ? "yes" : "no"} data-draft={p.draft ? p.draft.length : "none"} />;
  },
}));

describe("area selection flow", () => {
  const tap = async (e: number, n: number) => {
    const [lon, lat] = fromD96(e, n);
    await act(async () => { await (globalThis as { __mapClick?: (a: number, b: number) => Promise<void> }).__mapClick?.(lon, lat); });
  };

  it("draws a polygon, previews the count, switches to buildings and adds them to the cart", async () => {
    renderAt("/");
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
    expect(await within(panel).findByTestId("area-count")).toHaveTextContent(/V območju: [1-9]\d* parcel/);
    fireEvent.click(within(panel).getByRole("radio", { name: "Stavbe" }));
    await vi.waitFor(() => expect(within(panel).getByTestId("area-count")).toHaveTextContent(/stavb/));
    const n = Number(within(panel).getByTestId("area-count").textContent!.match(/(\d+)/)![1]);
    expect(n).toBeGreaterThan(0);
    fireEvent.click(within(panel).getByRole("button", { name: `Dodaj za izpis ZK (${n})` }));
    await cartCount(String(n));
    expect(await within(panel).findByRole("button", { name: `Dodano na seznam za izpise ZK (${n})` })).toBeDisabled();
  });

  it("refuses an area spanning too many cadastral municipalities", async () => {
    renderAt("/");
    fireEvent.click(screen.getByRole("button", { name: "Izberi območje" }));
    await tap(540000, 150000); await tap(560000, 150000); await tap(560000, 165000);
    fireEvent.click(within(await screen.findByTestId("draw-toolbar")).getByRole("button", { name: "Zaključi" }));
    expect(await within(await screen.findByTestId("area-panel")).findByRole("alert")).toHaveTextContent("preveliko");
  });
});

describe("list import flow", () => {
  it("pastes a list, adds valid rows to the cart and reports invalid rows with reasons", async () => {
    renderAt("/");
    fireEvent.click(screen.getByRole("button", { name: /^Izpisi iz zemljiške knjige/ }));
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
    await cartCount("3");
  });
});
