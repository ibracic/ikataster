/** Renders the whole map page on the real cadastre composition (see ./cadastre.ts). MapView must be mocked by the test file. */
import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { MemoryRouter } from "react-router";
import { I18nProvider } from "../i18n";
import { GursContext } from "../gurs/instance";
import { MapPage } from "../ui/MapPage";
import { testCadastre, type TestCadastre } from "./cadastre";
import { CartContext } from "../cart/useCart";
import { createCartStore } from "../cart/store";
import { createValues, ValuesContext } from "../values";
import { TxContext, type Transactions } from "../transactions";
const fakeTx: Transactions = { get: async () => null, count: async () => 0, clear: async () => {} };

const fakeValues = () => createValues({
  name: `flow-values-${Math.random()}`, base: "https://data.example",
  fetch: (async () => new Response(JSON.stringify({ date: "2026-09-26", p: { "1587": 123456 }, d: {} }))) as unknown as typeof fetch,
});

let cartN = 0;
/** The badge may already show an older count; wait until it shows the expected one. */
export const cartCount = (n: string) => vi.waitFor(() => expect(screen.getByTestId("cart-count")).toHaveTextContent(n));

/** Renders the app on the real cadastre composition (copy of central Maribor, KO 657). */
export function renderAt(url: string, cadastre: TestCadastre = testCadastre(), cart = createCartStore(`flow-cart-${++cartN}`)) {
  localStorage.clear();
  const view = render(
    <MemoryRouter initialEntries={[url]}>
      <MantineProvider><I18nProvider><GursContext.Provider value={cadastre.client}><CartContext.Provider value={cart}><ValuesContext.Provider value={fakeValues()}><TxContext.Provider value={fakeTx}><MapPage /></TxContext.Provider></ValuesContext.Provider></CartContext.Provider></GursContext.Provider></I18nProvider></MantineProvider>
    </MemoryRouter>,
  );
  return { ...view, cadastre };
}

