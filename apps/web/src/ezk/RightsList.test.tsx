import type { EzkExtract } from "./types";

import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { I18nProvider } from "../i18n";
import { RightsList } from "./RightsList";

it("labels a land charge (zemljiški dolg) separately and shows maturity type when there is no due date", () => {
  localStorage.setItem("ikataster.lang", "sl");
  const x = { kind: "current", pending: false, owners: [], benefits: [],
    property: { type: "parcel", koId: 997, koName: "PRIMERNO", number: "20/3", label: "997 PRIMERNO 20/3" }, rights: [{
    id: 10000011, order: 1, code: 403, category: "mortgage" as const, type: "403 - vknjižen zemljiški dolg", holders: [], positionIds: [1], secondary: [],
    charge: { amount: 5000000, currency: "EUR", amountText: "5.000.000,00 EUR", maturityType: "2 - do odpoklica" },
  }] } as EzkExtract;
  render(<MantineProvider><I18nProvider><RightsList extract={x} /></I18nProvider></MantineProvider>);
  const r = screen.getByTestId("right-10000011");
  expect(r).toHaveTextContent("Zemljiški dolg");
  expect(r).not.toHaveTextContent("Hipoteka");
  expect(r).toHaveTextContent("zapadlost do odpoklica");
});
