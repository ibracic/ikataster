import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { I18nProvider } from "../i18n";
import { OrthoYearBar } from "./OrthoYearBar";

const ui = (year: number, onChange = vi.fn(), onClose = vi.fn()) =>
  render(<MantineProvider><I18nProvider><OrthoYearBar year={year} onChange={onChange} onClose={onClose} /></I18nProvider></MantineProvider>);

describe("OrthoYearBar", () => {
  it("shows the year and steps between available years", () => {
    const onChange = vi.fn();
    ui(2009, onChange);
    expect(screen.getByTestId("ortho-year").textContent).toBe("2009");
    fireEvent.click(screen.getByRole("button", { name: "Prejšnje leto" }));
    expect(onChange).toHaveBeenLastCalledWith(2006);
    fireEvent.click(screen.getByRole("button", { name: "Naslednje leto" }));
    expect(onChange).toHaveBeenLastCalledWith(2010);
  });
  it("disables stepping past the ends and closes", () => {
    const onClose = vi.fn();
    ui(2025, vi.fn(), onClose);
    expect((screen.getByRole("button", { name: "Naslednje leto" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Zapri zgodovinski ortofoto" }));
    expect(onClose).toHaveBeenCalled();
  });
});
