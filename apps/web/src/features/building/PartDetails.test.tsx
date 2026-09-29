import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { I18nProvider } from "../../i18n";
import { PartDetails } from "./PartDetails";
import { CartContext } from "../../cart/useCart";
import { createCartStore } from "../../cart/store";

describe("PartDetails", () => {
  it("shows part attributes and its own sales", () => {
    const part = { eid: "1", number: 3, use: "stanovanje", area: 60, usableArea: 55.5, floor: "2", elevator: false, condominium: true, windowsYear: 2015, address: "Ptuj, Vzorčna ulica 1", flat: 4, status: "Registrski" };
    const tx = { status: "ready" as const, tx: { ko: 999, date: "2026-09-27", s: { "1": ["2021-02-11", 120000, 1, 1, 1, 0] as [string, number, number, number, number, number] }, sd: { "20/3": [[1, null, 55.5, 2, "1/1", "2"] as [number, null, number, number, string, string]] }, sp: {}, r: {}, rd: {} } };
    render(<MantineProvider><I18nProvider><CartContext.Provider value={createCartStore(`pd-${Math.random()}`)}>
      <PartDetails part={part} building={20} values={{ status: "ready", values: null }} tx={tx} cartItem={{ kind: "part", koId: 999, koName: "X", number: "20", part: 3, eid: "1", geometry: null }} />
    </CartContext.Provider></I18nProvider></MantineProvider>);
    const el = screen.getByTestId("part-details");
    expect(el.textContent).toContain("Vzorčna ulica 1");
    expect(el.textContent).toContain("Obnova oken2015");
    expect(el.textContent).toContain("Etažna lastninaDa");
    expect(screen.getAllByTestId("tx-row")).toHaveLength(1);
  });
});
