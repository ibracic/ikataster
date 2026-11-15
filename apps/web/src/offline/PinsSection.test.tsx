import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { I18nProvider } from "../i18n";
import { GursContext } from "../gurs/instance";
import { OfflineContext } from "./instance";
import { PinsSection } from "./PinsSection";
import { collectBackup } from "../data/backup";
import { testCadastre } from "../test/cadastre";

it("saves a KO from the copy for offline use, refreshes it, removes it, and it is part of the backup", async () => {
  localStorage.clear();
  const { client, store } = testCadastre();
  const msg = vi.fn();
  render(<MantineProvider><I18nProvider><GursContext.Provider value={client}><OfflineContext.Provider value={store}>
    <PinsSection onMessage={msg} />
  </OfflineContext.Provider></GursContext.Provider></I18nProvider></MantineProvider>);

  // pick KO 683 (real KO list from the copy) and save it
  fireEvent.click(screen.getByRole("textbox", { name: "Shrani k.o." }));
  fireEvent.change(screen.getByRole("textbox", { name: "Shrani k.o." }), { target: { value: "683" } });
  fireEvent.click(await screen.findByRole("option", { name: /^683 /, hidden: true }));
  fireEvent.click(screen.getByRole("button", { name: "Shrani k.o." }));
  await waitFor(() => expect(msg).toHaveBeenCalledWith("teal", expect.stringMatching(/^Shranjeno za uporabo brez povezave: 683 /)));
  expect(await screen.findByTestId("pin-list")).toHaveTextContent(/683 .*1 stavbe · 1 deli stavb/);
  const first = (await store.getPin(683))!.pinnedAt;

  await new Promise((r) => setTimeout(r, 5));
  fireEvent.click(screen.getByRole("button", { name: "Osveži 683" }));
  await waitFor(async () => expect((await store.getPin(683))!.pinnedAt).toBeGreaterThan(first));

  const b = await collectBackup({ gurs: store.db });
  expect(b.dbs.gurs.pins).toHaveLength(1);
  expect(b.dbs.gurs.buildings).toHaveLength(1);

  fireEvent.click(screen.getByRole("button", { name: "Odstrani 683" }));
  await waitFor(() => expect(screen.queryByTestId("pin-list")).not.toBeInTheDocument());
  expect(await store.db.buildings.count()).toBe(0);
});
