import { render, screen, fireEvent, act } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { I18nProvider } from "../i18n";
import { InstallHint } from "./InstallHint";
import { HINT_KEY } from "./platform";

const wrap = (el: React.ReactNode) => render(<MantineProvider><I18nProvider>{el}</I18nProvider></MantineProvider>);

it("iOS Safari: shows Add to Home Screen once, dismiss is remembered", () => {
  localStorage.removeItem(HINT_KEY);
  const v = wrap(<InstallHint platform="ios-safari" />);
  expect(screen.getByTestId("install-hint")).toHaveTextContent(/Dodaj na začetni zaslon/);
  expect(screen.getByTestId("install-hint")).toHaveTextContent(/7 dneh/);
  fireEvent.click(screen.getByRole("button", { name: "Zapri" }));
  expect(screen.queryByTestId("install-hint")).toBeNull();
  expect(localStorage.getItem(HINT_KEY)).toBe("1");
  v.unmount();
  wrap(<InstallHint platform="ios-safari" />);
  expect(screen.queryByTestId("install-hint")).toBeNull();
});

it("Chromium: install button appears after beforeinstallprompt and triggers the prompt", async () => {
  localStorage.removeItem(HINT_KEY);
  wrap(<InstallHint platform="android" />);
  expect(screen.queryByTestId("install-hint")).toBeNull();
  const prompt = vi.fn(async () => {});
  const ev = Object.assign(new Event("beforeinstallprompt"), { prompt, userChoice: Promise.resolve({ outcome: "accepted" }) });
  act(() => { window.dispatchEvent(ev); });
  fireEvent.click(await screen.findByRole("button", { name: "Namesti" }));
  await vi.waitFor(() => expect(prompt).toHaveBeenCalled());
  await vi.waitFor(() => expect(screen.queryByTestId("install-hint")).toBeNull());
  expect(localStorage.getItem(HINT_KEY)).toBe("1");
});
