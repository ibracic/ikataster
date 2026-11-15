import { fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { I18nProvider } from "../i18n";
import { MoreActions } from "./MoreActions";

it("keeps secondary actions behind More and closes after selecting an action", async () => {
  const help = vi.fn();
  render(<MantineProvider><I18nProvider><MoreActions actions={[
    { label: "Pomoč", icon: <span>?</span>, onClick: help },
    { label: "GitHub", icon: <span>G</span>, href: "https://github.com/ibracic/ikataster" },
  ]} /></I18nProvider></MantineProvider>);
  expect(screen.queryByRole("menuitem", { name: /Pomoč/, hidden: true })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Več" }));
  expect(await screen.findByRole("menuitem", { name: /GitHub/, hidden: true })).toHaveAttribute("href", "https://github.com/ibracic/ikataster");
  fireEvent.click(screen.getByRole("menuitem", { name: /Pomoč/, hidden: true }));
  expect(help).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "Več" })).toHaveAttribute("aria-expanded", "false");
});
