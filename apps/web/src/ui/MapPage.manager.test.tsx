import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { MemoryRouter } from "react-router";
import { I18nProvider } from "../i18n";
import { GursContext } from "../gurs/instance";
import { testCadastre } from "../test/cadastre";

vi.mock("../map/MapView", () => ({
  MapView: (p: { selection: { type: string; coordinates: unknown[] } | null }) =>
    <div data-testid="map" data-selected={p.selection ? `${p.selection.type}:${p.selection.coordinates.length}` : "no"} />,
}));
import { MapPage } from "./MapPage";
import { CartContext } from "../cart/useCart";
import { createCartStore } from "../cart/store";

// Real manager from the copy: GOKOP d.o.o. (id 1298), building 1639 in KO 657 (17 parts) and 784 in KO 683 (1 part).
const NAME = "GOKOP gradbeno, gostinsko in trgovsko podjetje d.o.o.";
let n = 0;
function renderAt(url: string) {
  localStorage.clear();
  const cadastre = testCadastre();
  const cart = createCartStore(`mgr-cart-${++n}`);
  render(
    <MemoryRouter initialEntries={[url]}>
      <MantineProvider><I18nProvider><GursContext.Provider value={cadastre.client}><CartContext.Provider value={cart}><MapPage /></CartContext.Provider></GursContext.Provider></I18nProvider></MantineProvider>
    </MemoryRouter>,
  );
  const loads = () => cadastre.requests.filter((r) => r === "/mgr/1298.json").length;
  return { cart, loads };
}

describe("manager (upravnik) view", () => {
  it("deep link shows the portfolio, highlights all buildings and adds parts to the cart", async () => {
    const { cart } = renderAt("/?upr=1298");
    expect(await screen.findByText(NAME)).toBeTruthy();
    expect(screen.getByTestId("manager-totals").textContent).toMatch(/2 stavb · 18 delov · 2 KO/);
    await waitFor(() => expect(screen.getByTestId("map").dataset.selected).toBe("MultiPolygon:2"));
    fireEvent.click(screen.getByRole("button", { name: /Dele stavb za izpis ZK \(18\)/ }));
    await waitFor(async () => expect(await cart.count()).toBe(18));
    const items = await cart.list();
    expect(items.every((i) => i.kind === "part" && i.geometry)).toBe(true);
    // everything already in the cart -> buttons disabled
    await waitFor(() => expect((screen.getByRole("button", { name: /Dele stavb za izpis ZK \(0 \/ 18\)/ }) as HTMLButtonElement).disabled).toBe(true));
  });

  it("KO filter from the deep link limits the list, highlight and cart add", async () => {
    const { cart } = renderAt("/?upr=1298&ko=683");
    await screen.findByText(NAME);
    await waitFor(() => expect(screen.getByTestId("map").dataset.selected).toBe("MultiPolygon:1"));
    expect(screen.getByTestId("manager-buildings").textContent).not.toMatch(/1639/);
    fireEvent.click(screen.getByRole("button", { name: /Stavbe za izpis ZK \(1\)/ }));
    await waitFor(async () => expect(await cart.count()).toBe(1));
    expect((await cart.list())[0]).toMatchObject({ kind: "building", koId: 683, number: "784" });
  });

  it("search finds a manager by name and opens the panel", async () => {
    const { loads } = renderAt("/");
    fireEvent.click(await screen.findByText("Upravnik"));
    fireEvent.change(screen.getByLabelText("Upravnik stavbe"), { target: { value: "gokop" } });
    fireEvent.click(await screen.findByText(NAME));
    await screen.findByTestId("manager-totals");
    expect(loads()).toBe(1);
  });

  it("opening a building keeps the manager search and list; back returns without reloading", async () => {
    const { loads } = renderAt("/");
    fireEvent.click(await screen.findByText("Upravnik"));
    fireEvent.change(screen.getByLabelText("Upravnik stavbe"), { target: { value: "gokop" } });
    fireEvent.click(await screen.findByText(NAME));
    await screen.findByTestId("manager-totals");
    fireEvent.click(screen.getByText("Stavba 1639"));
    expect(await screen.findByTestId("building-panel")).toBeTruthy();
    expect((screen.getByLabelText("Upravnik stavbe") as HTMLInputElement).value).toBe(NAME);
    expect(screen.getByTestId("manager-host").style.display).toBe("none");
    fireEvent.click(screen.getByRole("button", { name: /Nazaj na upravnika/ }));
    await waitFor(() => expect(screen.queryByTestId("building-panel")).toBeNull());
    expect(screen.getByTestId("manager-host").style.display).toBe("");
    expect(screen.getByTestId("manager-totals")).toBeTruthy();
    expect(loads()).toBe(1);
  });

  it("a manager no longer in the copy (old link) shows a friendly message, not an error", async () => {
    renderAt("/?upr=5");
    expect(await screen.findByText(/ni evidentiranih delov stavb/)).toBeTruthy();
    expect(screen.queryByText(/napako/)).toBeNull();
  });
});
