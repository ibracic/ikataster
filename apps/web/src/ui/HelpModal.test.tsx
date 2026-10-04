import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { I18nProvider } from "../i18n";
import { HelpModal } from "./HelpModal";

describe("HelpModal", () => {
  it("shows the getting-started steps", () => {
    render(<MantineProvider><I18nProvider><HelpModal opened onClose={() => {}} /></I18nProvider></MantineProvider>);
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getAllByRole("tab")).toHaveLength(2);
  });
});
