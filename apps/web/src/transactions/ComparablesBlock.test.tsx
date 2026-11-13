import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { render } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { I18nProvider } from "../i18n";
import type { ReactNode } from "react";
const renderWithProviders = (ui: ReactNode) => render(<MantineProvider><I18nProvider>{ui}</I18nProvider></MantineProvider>);
import { ComparablesBlock } from "./ComparablesBlock";

describe("ComparablesBlock", () => {
  it("shows median, estimate and rows", () => {
    renderWithProviders(<ComparablesBlock data={{ count: 2, medianPerM2: 1971, estimate: 122200, items: [
      { key: "10/2", date: "2024-06-10", price: 150000, area: 70, perM2: 2143 },
      { key: "11/1", date: "2023-01-20", price: 90000, area: 50, perM2: 1800 }] }} />);
    expect(screen.getByText(/Primerljive prodaje v k.o. \(2\)/)).toBeTruthy();
    expect(screen.getByTestId("comp-median").textContent).toMatch(/1\.?971/);
    expect(screen.getByTestId("comp-estimate").textContent).toMatch(/122\.200/);
    expect(screen.getAllByTestId("comp-row")).toHaveLength(2);
  });
  it("renders nothing without data", () => {
    const { container } = renderWithProviders(<ComparablesBlock data={null} />);
    expect(container.querySelector("[data-testid=comparables]")).toBeNull();
  });
});
