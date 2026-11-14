import { render, screen, fireEvent } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { I18nProvider } from "../../i18n";
import { ManagerSearch } from "./ManagerSearch";
import type { GursClient, Manager } from "../../gurs";

function setup() {
  localStorage.clear();
  const searched: string[] = [];
  const client = { searchManagers: async (q: string) => { searched.push(q); return { managers: [{ id: 5, name: "STANINVEST d.o.o.", address: null, parts: 10 }], truncated: false }; } } as unknown as GursClient;
  const picked: Manager[] = [];
  render(<MantineProvider><I18nProvider><ManagerSearch client={client} debounceMs={10} onSelect={(m) => picked.push(m)} /></I18nProvider></MantineProvider>);
  return { searched, picked };
}

describe("ManagerSearch", () => {
  it("searches the managers from 3 letters on and picks one", async () => {
    const { searched, picked } = setup();
    const box = screen.getByLabelText("Upravnik stavbe");
    fireEvent.change(box, { target: { value: "st" } });
    expect(searched).toEqual([]);
    fireEvent.change(box, { target: { value: "stan" } });
    fireEvent.click(await screen.findByText("STANINVEST d.o.o."));
    expect(searched).toEqual(["stan"]);
    expect(picked.map((m) => m.id)).toEqual([5]);
    expect(localStorage.getItem("ikataster.manager.last")).toBe("STANINVEST d.o.o.");
  });
});
