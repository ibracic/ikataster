import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { I18nProvider } from "../i18n";
import { createResultsStore } from "./results";
import { FoldersPanel } from "./FoldersPanel";
import type { EzkExtract } from "./types";

const x = (n: string): EzkExtract => ({
  kind: "current", createdAt: "2026-09-28T10:00:00", pending: false, rights: [], benefits: [],
  owners: [{ positionId: 1, right: "101", share: "1/1", shareValue: 1, holder: { kind: "company", name: "ACME d.o.o.", address: "Maribor", companyId: "1" }, restrictions: [] }],
  property: { type: "parcel", koId: 657, koName: "MARIBOR GRAD", number: n, label: `657 MARIBOR GRAD ${n}` },
} as EzkExtract);

it("creates, opens (with confirm), renames and deletes folders", async () => {
  const store = createResultsStore(`fp-${Date.now()}`);
  await store.put(x("1"), "1.pdf", new Uint8Array([1]));
  await store.put(x("2"), "2.pdf");
  const ui = (count: number) => <MantineProvider><I18nProvider><FoldersPanel store={store} currentCount={count} /></I18nProvider></MantineProvider>;
  const { rerender } = render(ui(2));

  fireEvent.click(screen.getByRole("button", { name: "Shrani kot mapo" }));
  fireEvent.change(screen.getByLabelText("Ime mape"), { target: { value: "Blok Tabor" } });
  fireEvent.click(screen.getByRole("button", { name: "Shrani", hidden: true }));
  expect(await screen.findByText("Blok Tabor")).toBeTruthy();
  expect(screen.getByText(/2 nepremičnin/)).toBeTruthy();

  // change current results, open folder -> needs a second click, then restores both
  await store.remove(["parcel:657:2"]);
  rerender(ui(1));
  fireEvent.click(screen.getByRole("button", { name: "Odpri mapo Blok Tabor", hidden: true }));
  expect(screen.getByTestId("folder-confirm").textContent).toMatch(/zamenjani/);
  expect(await store.list()).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Odpri mapo Blok Tabor", hidden: true }));
  await waitFor(async () => expect(await store.list()).toHaveLength(2));
  expect((await store.pdfs(["parcel:657:1"])).size).toBe(1);

  fireEvent.click(screen.getByRole("button", { name: "Preimenuj Blok Tabor", hidden: true }));
  fireEvent.change(screen.getByLabelText("Ime mape"), { target: { value: "Tabor 2026" } });
  fireEvent.click(screen.getByRole("button", { name: "Shrani", hidden: true }));
  expect(await screen.findByText("Tabor 2026")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Izbriši mapo Tabor 2026", hidden: true }));
  fireEvent.click(screen.getByRole("button", { name: "Izbriši mapo Tabor 2026", hidden: true }));
  await waitFor(() => expect(screen.queryByTestId("folder-row")).toBeNull());
});
