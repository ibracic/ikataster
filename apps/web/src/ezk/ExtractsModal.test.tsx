import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { I18nProvider } from "../i18n";
import { ExtractsModal } from "./ExtractsModal";

describe("ExtractsModal", () => {
  it("shows both tabs with counts and switches between to-do list and downloaded extracts", async () => {
    const onTab = vi.fn();
    const { rerender } = render(<MantineProvider><I18nProvider><ExtractsModal opened tab="todo" onTab={onTab} onClose={() => {}} /></I18nProvider></MantineProvider>);
    expect(await screen.findByTestId("cart-panel")).toBeInTheDocument();
    expect(screen.getByTestId("tab-todo")).toHaveTextContent("Za prenos (0)");
    expect(screen.getByTestId("tab-done")).toHaveTextContent("Preneseni (0)");
    fireEvent.click(screen.getByTestId("tab-done"));
    expect(onTab).toHaveBeenCalledWith("done");
    rerender(<MantineProvider><I18nProvider><ExtractsModal opened tab="done" onTab={onTab} onClose={() => {}} /></I18nProvider></MantineProvider>);
    expect(await screen.findByTestId("results-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("cart-panel")).toBeNull();
  });
});
