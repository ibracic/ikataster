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

describe("building flow", () => {
  it("deep link ?ko=657&st=130 shows the building with its parts", async () => {
    renderAt("/?ko=657&st=130");
    const panel = await screen.findByTestId("building-panel");
    expect(within(panel).getByRole("heading", { name: "130" })).toBeInTheDocument();
    expect(within(panel).getByText("krajna vrstna stavba")).toBeInTheDocument();
    expect(within(panel).getByText("1949")).toBeInTheDocument();
    const table = await within(panel).findByTestId("parts-table");
    expect(within(panel).getByText(/Deli stavbe \(61\)/)).toBeInTheDocument();
    expect(within(table).getAllByText(/^Stanovanje/).length).toBeGreaterThan(10);
    expect(screen.getByTestId("map")).toHaveAttribute("data-selected", "yes");
    expect(screen.getByRole("radio", { name: "Stavba" })).toBeChecked();
  });

  it("opens a building from the parcel panel", async () => {
    renderAt("/?ko=657&p=1136");
    const panel = await screen.findByTestId("parcel-panel");
    fireEvent.click(await within(panel).findByRole("button", { name: "Stavba 1630" }));
    expect(within(await screen.findByTestId("building-panel")).getByRole("heading", { name: "1630" })).toBeInTheDocument();
    expect(screen.queryByTestId("parcel-panel")).not.toBeInTheDocument();
  });

  it("reports a missing building", async () => {
    renderAt("/?ko=657&st=99999999");
    expect(await screen.findByRole("alert")).toHaveTextContent("Stavbe ni v katastru");
  });
});

