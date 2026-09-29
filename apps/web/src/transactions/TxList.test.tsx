import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { I18nProvider } from "../i18n";
import { TxList } from "./TxList";
import { buildingTx, type KoTx } from ".";

const lease: KoTx = { ko: 999, date: "2026-09-27", s: {}, sd: {}, sp: {},
  r: { "7": ["2023-10-13", 60806, 1, 4, "2023-10-13", "2039-12-31"] },
  rd: { "30/1": [[7, null, 11, 15]], "30/2": [[7, null, 21.2, 3]] } };

describe("TxList", () => {
  it("expands a grouped lease to show contract terms and the parts it covers", () => {
    render(<MantineProvider><I18nProvider><TxList state={{ status: "ready", tx: lease }} items={buildingTx(lease, 30)} /></I18nProvider></MantineProvider>);
    expect(screen.queryByTestId("tx-details")).toBeNull();
    expect(screen.getByTestId("tx-row").textContent).toContain("cela pogodba");
    fireEvent.click(screen.getByTestId("tx-toggle"));
    const d = screen.getByTestId("tx-details").textContent!;
    expect(d).toContain("oddajanje na prostem trgu");
    expect(d).toContain("13. 10. 2023 – 31. 12. 2039");
    expect(d).toContain("2 delov stavbe skupaj");
    expect(screen.getByTestId("tx-parts").querySelectorAll("tbody tr")).toHaveLength(2);
  });
});
