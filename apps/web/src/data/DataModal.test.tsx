import { vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { I18nProvider } from "../i18n";
import { CartContext } from "../cart/useCart";
import { ResultsContext } from "../ezk/useResults";
import { createCartStore } from "../cart/store";
import { createResultsStore } from "../ezk/results";
import { DataModal } from "./DataModal";

it("downloads a backup and restores it after confirmation", async () => {
  const tag = Date.now();
  const cart = createCartStore(`dm-cart-${tag}`), res = createResultsStore(`dm-res-${tag}`);
  await cart.add([{ kind: "parcel", koId: 657, koName: "MARIBOR GRAD", number: "1587", eid: "E", geometry: null }]);
  let file: { bytes: Uint8Array; name: string } | null = null;
  const restored = vi.fn();
  render(
    <MantineProvider><I18nProvider><CartContext.Provider value={cart}><ResultsContext.Provider value={res}>
      <DataModal opened onClose={() => {}} download={(bytes, name) => { file = { bytes, name }; }} onRestored={restored} />
    </ResultsContext.Provider></CartContext.Provider></I18nProvider></MantineProvider>,
  );
  await waitFor(() => expect(screen.getByTestId("persist-state")).toHaveTextContent("Trajna shramba ni podprta")); // jsdom
  fireEvent.click(screen.getByRole("button", { name: /Shrani kopijo/ }));
  await waitFor(() => expect(file).not.toBeNull());
  expect(screen.getByTestId("last-backup")).toHaveTextContent("Zadnja: danes");
  expect(file!.name).toMatch(/^ikataster-varnostna-kopija-\d{4}-\d{2}-\d{2}\.zip$/);

  await cart.clear();
  const input = document.querySelector('input[type=file]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File([file!.bytes as BlobPart], file!.name)] } });
  expect(await screen.findByTestId("restore-confirm")).toHaveTextContent(/Za izpis ZK: 1/i);
  expect(await cart.count()).toBe(0); // nothing changes before confirmation
  fireEvent.click(screen.getByRole("button", { name: "Zamenjaj vse podatke" }));
  await waitFor(() => expect(restored).toHaveBeenCalled());
  expect(await cart.count()).toBe(1);

  fireEvent.change(input, { target: { files: [new File(["hello"], "x.json")] } });
  expect(await screen.findByTestId("data-msg")).toHaveTextContent("ni varnostna kopija");
});

it("on iPhone Safari offers Add to Home Screen instead of the persist request", async () => {
  const ua = vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1");
  const tag = Date.now();
  render(
    <MantineProvider><I18nProvider><CartContext.Provider value={createCartStore(`ios-c-${tag}`)}><ResultsContext.Provider value={createResultsStore(`ios-r-${tag}`)}>
      <DataModal opened onClose={() => {}} />
    </ResultsContext.Provider></CartContext.Provider></I18nProvider></MantineProvider>,
  );
  expect(screen.queryByRole("button", { name: "Zaščiti podatke" })).toBeNull();
  fireEvent.click(screen.getByTestId("ios-home-btn"));
  expect(screen.getByTestId("ios-home-help")).toHaveTextContent("Dodaj na začetni zaslon");
  ua.mockRestore();
});
