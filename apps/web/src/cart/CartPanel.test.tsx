import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { I18nProvider } from "../i18n";
import { CartContext } from "./useCart";
import { createCartStore } from "./store";
import { GursContext } from "../gurs/instance";
import { testCadastre } from "../test/cadastre";
import { CART_PAGE, CartPanel } from "./CartPanel";

it("a list with thousands of items (a big manager's parts) draws one page at a time", async () => {
  const cart = createCartStore(`cp-${Date.now()}`);
  await cart.add(Array.from({ length: 3000 }, (_, i) => ({ kind: "part" as const, koId: 657, koName: "", number: String(1 + Math.floor(i / 50)), part: 1 + (i % 50), eid: String(i), geometry: null })));
  render(<MantineProvider><I18nProvider><GursContext.Provider value={testCadastre().client}><CartContext.Provider value={cart}>
    <CartPanel />
  </CartContext.Provider></GursContext.Provider></I18nProvider></MantineProvider>);
  const list = await screen.findByTestId("cart-list");
  const rows = () => list.querySelectorAll("[aria-label^='Odstrani']").length;
  expect(rows()).toBe(CART_PAGE);
  expect(screen.getByTestId("cart-more")).toHaveTextContent(String(3000 - CART_PAGE));
  fireEvent.click(screen.getByTestId("cart-more"));
  await waitFor(() => expect(rows()).toBeGreaterThan(CART_PAGE));
});
