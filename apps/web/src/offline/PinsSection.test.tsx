import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { I18nProvider } from "../i18n";
import { GursContext } from "../gurs/instance";
import { createGursClient, type KoDownload } from "../gurs";
import { OfflineContext } from "./instance";
import { createOfflineStore } from "./store";
import { PinsSection } from "./PinsSection";
import { collectBackup } from "../data/backup";

const poly = { type: "Polygon" as const, coordinates: [[[15, 46], [15.001, 46], [15.001, 46.001], [15, 46]]] };
const dl = (name: string): KoDownload => ({
  ko: { id: 2, name },
  parcels: [{ eid: "P1", koId: 2, koName: name, number: "1", area: 10, soilQuality: null, centroid: [15, 46], centroidD96: [0, 0], geometry: poly }],
  buildings: [], parts: [],
});

it("lists pinned KOs with size, refreshes with progress, removes, and is part of the backup", async () => {
  localStorage.setItem("ikataster.kos.v1", JSON.stringify({ at: Date.now(), kos: [{ id: 2, name: "SUHI VRH" }] }));
  const store = createOfflineStore(`pins-ui-${Date.now()}`);
  await store.savePin(dl("SUHI VRH"), 1000);
  let release!: () => void;
  const client = { ...createGursClient({ fetch: async () => new Response("{}") }),
    downloadKo: async (_ko: number, o: { onProgress?: (p: "parcels", d: number, t: number) => void } = {}) => {
      o.onProgress?.("parcels", 150, 300);
      await new Promise<void>((r) => { release = r; });
      return dl("SUHI VRH");
    } };
  const msg = vi.fn();
  render(<MantineProvider><I18nProvider><GursContext.Provider value={client as never}><OfflineContext.Provider value={store}>
    <PinsSection onMessage={msg} />
  </OfflineContext.Provider></GursContext.Provider></I18nProvider></MantineProvider>);
  expect(await screen.findByTestId("pin-list")).toHaveTextContent(/2 SUHI VRH.*1 parcele · 0 stavbe · 0 deli stavb · 0,0 MB/);

  fireEvent.click(screen.getByRole("button", { name: "Osveži 2" }));
  expect(await screen.findByTestId("pin-progress")).toHaveTextContent("2 · Parcele: 150 / 300");
  release();
  await waitFor(() => expect(msg).toHaveBeenCalledWith("teal", "Shranjeno za uporabo brez povezave: 2 SUHI VRH"));
  expect((await store.getPin(2))!.pinnedAt).toBeGreaterThan(1000);

  const b = await collectBackup({ gurs: store.db });
  expect(b.dbs.gurs.pins).toHaveLength(1);
  expect(b.dbs.gurs.parcels).toHaveLength(1);

  fireEvent.click(screen.getByRole("button", { name: "Odstrani 2" }));
  await waitFor(() => expect(screen.queryByTestId("pin-list")).not.toBeInTheDocument());
  expect(await store.db.parcels.count()).toBe(0);
});
