import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { I18nProvider } from "../i18n";
import { CartContext } from "../cart/useCart";
import { createCartStore } from "../cart/store";
import { GursContext } from "../gurs/instance";
import { testCadastre } from "../test/cadastre";
import { MissingActions } from "./MissingActions";

it("a building without its own LR entry offers its parts and the parcels it stands on, from the copy", async () => {
  const cart = createCartStore(`ma-${Date.now()}`);
  const { client } = testCadastre();
  render(<MantineProvider><I18nProvider><GursContext.Provider value={client}><CartContext.Provider value={cart}>
    <MissingActions item={{ kind: "building", koId: 657, koName: "TABOR", number: "130", eid: "x", geometry: null }} />
  </CartContext.Provider></GursContext.Provider></I18nProvider></MantineProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "Dodaj dele stavbe (61)" }));
  await waitFor(async () => expect(await cart.count()).toBe(61));
  expect((await cart.list())[0]).toMatchObject({ kind: "part", koId: 657, number: "130" });
  fireEvent.click(screen.getByRole("button", { name: "Dodaj parcele pod stavbo (2)" }));
  await waitFor(async () => expect(await cart.count()).toBe(63));
  expect((await cart.list()).filter((i) => i.kind === "parcel").map((i) => i.number).sort()).toEqual(["1233/2", "1234"]);
  expect(await screen.findByText(/Dodano na seznam/)).toBeInTheDocument();
});

it("parcels and parts without their own entry get no extra actions", () => {
  const { client } = testCadastre();
  const { container } = render(<MantineProvider><I18nProvider><GursContext.Provider value={client}>
    <CartContext.Provider value={createCartStore(`ma2-${Date.now()}`)}>
      <MissingActions item={{ kind: "parcel", koId: 657, koName: "X", number: "1587", eid: "x", geometry: null }} />
    </CartContext.Provider></GursContext.Provider></I18nProvider></MantineProvider>);
  expect(container.querySelector("button")).toBeNull();
});
