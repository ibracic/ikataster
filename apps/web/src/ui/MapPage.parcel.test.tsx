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

describe("parcel search flow", () => {
  it("deep link ?ko=657&p=1587 highlights the parcel and shows its details from the copy", async () => {
    const { cadastre } = renderAt("/?ko=657&p=1587");
    const panel = await screen.findByTestId("parcel-panel");
    expect(within(panel).getByRole("heading", { name: "1587" })).toBeInTheDocument();
    expect(within(panel).getByText(/657 MARIBOR GRAD/)).toBeInTheDocument();
    expect(within(panel).getByText(/^1[.\s\u00a0]?011 m²$/)).toBeInTheDocument();
    expect(await within(panel).findByText("RT-72")).toBeInTheDocument();
    expect(within(panel).getAllByText(/poseljena zemljišča/).length).toBeGreaterThan(0);
    expect(within(panel).getAllByText(/osrednja območja centralnih dejavnosti/i).length).toBeGreaterThan(0);
    expect(within(panel).getByRole("link", { name: /javnem vpogledu/ })).toHaveAttribute("href", "https://ipi.eprostor.gov.si/jv/?eid=100100000222153246");
    expect((await within(panel).findAllByText(/123[.\s\u00a0]456/)).length).toBeGreaterThan(0);
    expect(screen.getByTestId("map")).toHaveAttribute("data-selected", "yes");
    expect(cadastre.requests.filter((r) => r.startsWith("/ko/657"))).toHaveLength(1);
  });

  it("shows a friendly message when the parcel does not exist", async () => {
    renderAt("/?ko=657&p=999999");
    expect(await screen.findByRole("alert")).toHaveTextContent("Parcele ni v katastru");
    expect(screen.queryByTestId("parcel-panel")).not.toBeInTheDocument();
  });

  it("offline with nothing saved: tells the user the data can't be loaded", async () => {
    const cadastre = testCadastre();
    cadastre.setOnline(false);
    renderAt("/?ko=657&p=1587", cadastre);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByTestId("parcel-panel")).not.toBeInTheDocument();
  });

  it("offline after a visit: answers from the KO saved on the device and shows its age", async () => {
    const first = testCadastre();
    const v = renderAt("/?ko=657&p=1587", first);
    await screen.findByTestId("parcel-panel");
    await vi.waitFor(async () => expect((await first.store.listPins()).map((p) => p.koId)).toContain(657));
    v.unmount();
    const offline = testCadastre({ store: first.store });
    offline.setOnline(false);
    renderAt("/?ko=657&p=1587", offline);
    const panel = await screen.findByTestId("parcel-panel");
    expect(within(panel).getByRole("heading", { name: "1587" })).toBeInTheDocument();
    expect(await within(panel).findByTestId("cached-badge")).toBeInTheDocument();
  });

  it("closes the panel", async () => {
    renderAt("/?ko=657&p=1587");
    const panel = await screen.findByTestId("parcel-panel");
    fireEvent.click(within(panel).getByRole("button", { name: "Zapri" }));
    expect(screen.queryByTestId("parcel-panel")).not.toBeInTheDocument();
    expect(screen.getByTestId("map")).toHaveAttribute("data-selected", "no");
  });
});

describe("address search flow", () => {
  it("defaults to address mode, autocompletes from the copy and opens the parcel under the address", async () => {
    renderAt("/");
    const input = screen.getByRole("textbox", { name: "Naslov" });
    fireEvent.change(input, { target: { value: "Koroška cesta 12a" } });
    fireEvent.click(await screen.findByText("Koroška cesta 12a"));
    const panel = await screen.findByTestId("parcel-panel");
    expect(within(panel).getByText(/657 MARIBOR GRAD/)).toBeInTheDocument();
    expect(screen.getByTestId("map")).toHaveAttribute("data-selected", "yes");
  });

  it("keeps the suggestion list open and scrollable when the input loses focus (mobile scroll)", async () => {
    renderAt("/");
    const input = screen.getByRole("textbox", { name: "Naslov" });
    fireEvent.change(input, { target: { value: "Koroška cesta 1" } });
    const opt = await screen.findByText("Koroška cesta 12a");
    // iOS: touching/scrolling the list blurs the input (keyboard hides) – list must stay
    expect(input).toHaveAttribute("data-expanded", "true");
    fireEvent.blur(input);
    await new Promise((r) => setTimeout(r, 50));
    expect(input).toHaveAttribute("data-expanded", "true");
    const scroller = screen.getByTestId("address-options");
    expect(scroller.contains(opt)).toBe(true);
    expect(scroller.style.maxHeight).toMatch(/dvh|vh|px/);
    expect(scroller.style.overscrollBehavior).toBe("contain");
  });

  it("tells the user when there is no matching address", async () => {
    renderAt("/");
    fireEvent.change(screen.getByRole("textbox", { name: "Naslov" }), { target: { value: "Celovška cesta 99999" } });
    expect(await screen.findByText(/Ni zadetka/)).toBeInTheDocument();
  });

  it("switches to parcel mode", () => {
    renderAt("/");
    fireEvent.click(screen.getByRole("radio", { name: "Parcela" }));
    expect(screen.getByRole("textbox", { name: "Št. parcele" })).toBeInTheDocument();
  });
});

