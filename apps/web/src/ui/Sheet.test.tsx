import { render, screen, fireEvent } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { I18nProvider } from "../i18n";
import { ParcelPanel } from "../features/parcel/ParcelPanel";
import { CartContext } from "../cart/useCart";
import { createCartStore } from "../cart/store";
import type { Parcel } from "../gurs";

const parcel = { koId: 657, koName: "MARIBOR GRAD", number: "1587", eid: "e1", area: 1011, geometry: null } as unknown as Parcel;
const ui = (p: Parcel) => (
  <MantineProvider><I18nProvider><CartContext.Provider value={createCartStore(`sheet-${Math.random()}`)}>
    <ParcelPanel parcel={p} details={{ errors: [], landUse: [], intendedUse: [{ code: "CU", description: "Osrednja območja" }], buildings: [{ eid: "b", number: 1879, areaOnParcel: 10 }] } as never} onClose={() => {}} />
  </CartContext.Provider></I18nProvider></MantineProvider>
);

it("opens as a compact peek on mobile; handle tap/swipe expands and collapses; resets for a new parcel", () => {
  localStorage.setItem("ikataster.lang", "sl");
  const { rerender } = render(ui(parcel));
  const panel = screen.getByTestId("parcel-panel");
  expect(panel).toHaveAttribute("data-sheet", "peek");
  expect(screen.getByTestId("sheet-summary")).toHaveTextContent("1011 m² · CU · 1 × stavba");

  const handle = screen.getByRole("button", { name: "Pokaži podrobnosti" });
  fireEvent.click(handle);
  expect(panel).toHaveAttribute("data-sheet", "open");

  const h2 = screen.getByRole("button", { name: "Skrij podrobnosti" });
  fireEvent.touchStart(h2, { touches: [{ clientY: 300 }] });
  fireEvent.touchEnd(h2, { changedTouches: [{ clientY: 400 }] });
  expect(panel).toHaveAttribute("data-sheet", "peek");

  fireEvent.touchStart(h2, { touches: [{ clientY: 400 }] });
  fireEvent.touchEnd(h2, { changedTouches: [{ clientY: 300 }] });
  expect(panel).toHaveAttribute("data-sheet", "open");

  rerender(ui({ ...parcel, eid: "e2", number: "1588" } as Parcel));
  expect(screen.getByTestId("parcel-panel")).toHaveAttribute("data-sheet", "peek");
});
