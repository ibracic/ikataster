import { render, screen, fireEvent } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { I18nProvider } from "../i18n";
import { MemoryRouter } from "react-router";
import { GursContext } from "../gurs/instance";
import { createGursClient } from "../gurs";

vi.mock("../map/MapView", () => ({
  MapView: (p: { basemap: string; overlays: Record<string, boolean> }) => (
    <div data-testid="map" data-basemap={p.basemap} data-parcels={String(p.overlays.parcels)} />
  ),
}));
import { MapPage } from "./MapPage";

const setup = () => {
  window.matchMedia ||= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as never;
  globalThis.ResizeObserver ||= class { observe() {} unobserve() {} disconnect() {} } as never;
  localStorage.clear();
  return render(
    <MemoryRouter><MantineProvider><I18nProvider><GursContext.Provider value={createGursClient({ fetch: (async () => new Response(JSON.stringify({ type: "FeatureCollection", features: [], numberMatched: 0 }))) as unknown as typeof fetch })}><MapPage /></GursContext.Provider></I18nProvider></MantineProvider></MemoryRouter>,
  );
};

describe("MapPage", () => {
  it("shows the map and a search box immediately without login", () => {
    setup();
    expect(screen.getByTestId("map")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Naslov" })).toBeInTheDocument();
  });

  it("switches language to English and persists it", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Jezik" }));
    expect(screen.getByRole("textbox", { name: "Address" })).toBeInTheDocument();
    expect(localStorage.getItem("ikataster.lang")).toBe("en");
  });
});
