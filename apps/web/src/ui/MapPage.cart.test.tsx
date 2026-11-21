import { screen, within, fireEvent, act } from "@testing-library/react";
import { fromD96 } from "../gurs";
import { testCadastre } from "../test/cadastre";
import { renderAt, cartCount } from "../test/renderMap";
import { createCartStore } from "../cart/store";

vi.mock("../map/MapView", () => ({
  MapView: (p: { selection: unknown; onMapClick?: (lon: number, lat: number) => void; draft?: unknown[] | null }) => {
    (globalThis as { __mapClick?: typeof p.onMapClick }).__mapClick = p.onMapClick;
    return <div data-testid="map" data-selected={p.selection ? "yes" : "no"} data-draft={p.draft ? p.draft.length : "none"} />;
  },
}));

describe("cart flow", () => {
  it("adds a parcel once, shows the count and survives a remount", async () => {
    const cart = createCartStore(`flow-cart-persist-${Date.now()}`);
    const view = renderAt("/?ko=657&p=1587", undefined, cart);
    const panel = await screen.findByTestId("parcel-panel");
    fireEvent.click(within(panel).getByRole("button", { name: "Dodaj za izpis ZK" }));
    expect(await within(panel).findByRole("button", { name: "Na seznamu za izpis ZK" })).toBeDisabled();
    await cartCount("1");
    view.unmount();
    renderAt("/", undefined, cart);
    await cartCount("1");
  });

  it("adds all remaining parts of a building in one click", async () => {
    renderAt("/?ko=657&st=130", undefined, createCartStore(`flow-cart-all-${Date.now()}`));
    const panel = await screen.findByTestId("building-panel");
    await within(panel).findByTestId("parts-table");
    fireEvent.click(within(panel).getByLabelText("Del stavbe 2"));
    fireEvent.click(within(panel).getByText("Dodaj izbrane dele (1)"));
    await cartCount("1", 5000);
    fireEvent.click(await within(panel).findByRole("button", { name: "Vse dele za izpis ZK (60)" }));
    await cartCount("61", 5000);
    expect(await within(panel).findByRole("button", { name: "Vsi deli na seznamu za izpis ZK" })).toBeDisabled();
  });

  it("adds a building and selected parts, then removes and clears in the drawer", async () => {
    renderAt("/?ko=657&st=130");
    const panel = await screen.findByTestId("building-panel");
    await within(panel).findByTestId("parts-table");
    // label queries: role queries over a 61-row list cost ~1 s each in jsdom
    fireEvent.click(within(panel).getByLabelText("Del stavbe 2"));
    fireEvent.click(within(panel).getByLabelText("Del stavbe 3"));
    fireEvent.click(within(panel).getByText("Dodaj izbrane dele (2)"));
    expect(await within(panel).findByLabelText("Na seznamu za izpis ZK 2")).toBeDisabled();
    fireEvent.click(within(panel).getByRole("button", { name: "Dodaj za izpis ZK" }));
    await cartCount("3");

    fireEvent.click(screen.getByRole("button", { name: /^Izpisi iz zemljiške knjige \(3\// }));
    const list = await screen.findByTestId("cart-list");
    expect(within(list).getByText("Stavba 130")).toBeInTheDocument();
    expect(within(list).getByText("Del stavbe 130/2")).toBeInTheDocument();
    fireEvent.click(within(list).getByRole("button", { name: "Odstrani Del stavbe 130/2" }));
    await within(list).findByText("Del stavbe 130/3");
    await cartCount("2");
    fireEvent.click(within(list).getByRole("button", { name: "Izprazni seznam" }));
    fireEvent.click(within(list).getByRole("button", { name: "Res izprazni?" }));
    expect(await screen.findByText(/Seznam je prazen/)).toBeInTheDocument();
  });
});

