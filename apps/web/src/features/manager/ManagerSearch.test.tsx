import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { I18nProvider } from "../../i18n";
import { ManagerSearch } from "./ManagerSearch";
import { createCacheStore } from "../../cache/store";
import type { GursClient, Manager } from "../../gurs";

let n = 0;
async function setup() {
  localStorage.clear();
  const store = createCacheStore(`ms-test-${++n}`);
  await store.putManagers([
    { id: 617, name: "INDOMA d.o.o.", address: "Maribor", parts: 4162 },
    { id: 9, name: "DOMPLAN d.d.", address: "Kranj", parts: 900 },
  ]);
  const searched: string[] = [];
  const client = { searchManagers: async (q: string) => { searched.push(q); return { managers: [{ id: 5, name: "STANINVEST d.o.o.", address: null, parts: 10 }], truncated: false }; } } as unknown as GursClient;
  const picked: Manager[] = [];
  render(<MantineProvider><I18nProvider><ManagerSearch client={client} store={store} debounceMs={10} onSelect={(m) => picked.push(m)} /></I18nProvider></MantineProvider>);
  return { searched, picked };
}

describe("ManagerSearch with saved managers", () => {
  it("suggests saved managers on focus, filters while typing and picks without GURS", async () => {
    const { searched, picked } = await setup();
    const input = screen.getByLabelText("Upravnik stavbe");
    fireEvent.focus(input);
    await screen.findByText("INDOMA d.o.o.");
    expect(screen.getByText("DOMPLAN d.d.")).toBeTruthy();
    fireEvent.change(input, { target: { value: "ind" } });
    await waitFor(() => expect(screen.queryByText("DOMPLAN d.d.")).toBeNull());
    fireEvent.click(screen.getByText("INDOMA d.o.o."));
    expect(picked.map((m) => m.id)).toEqual([617]);
    await new Promise((r) => setTimeout(r, 50));
    expect(searched.filter((q) => q !== "ind")).toEqual([]); // picking never searches
  });

  it("still searches GURS for other text and lists new managers separately", async () => {
    const { searched } = await setup();
    fireEvent.change(screen.getByLabelText("Upravnik stavbe"), { target: { value: "stan" } });
    expect(await screen.findByText("STANINVEST d.o.o.")).toBeTruthy();
    expect(searched).toEqual(["stan"]);
    expect(screen.getByText("Iskanje v GURS")).toBeTruthy();
  });
});
