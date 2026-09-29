import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { I18nProvider } from "../i18n";
import { createQuota } from "./quota";
import { QuotaBadge, ezkErrorMessage, fmt } from "./QuotaBadge";

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };
const wrap = (ui: React.ReactNode) => render(<MantineProvider><I18nProvider>{ui}</I18nProvider></MantineProvider>);

describe("QuotaBadge", () => {
  it("shows usage and defers the part of a batch that does not fit today", () => {
    const q = createQuota(mem()); q.recordSuccess(390);
    wrap(<QuotaBadge quota={q} pending={25} />);
    expect(screen.getByText("390 / 400")).toBeTruthy();
    expect(screen.getByTestId("quota-deferred").textContent).toMatch(/10 .*25.*15/);
  });
  it("shows the exhausted state after eZK reported LIMIT", () => {
    const q = createQuota(mem()); q.recordSuccess(12); q.markExhausted();
    wrap(<QuotaBadge quota={q} pending={3} />);
    expect(screen.getByTestId("quota-exhausted")).toBeTruthy();
    expect(screen.getByText("400 / 400")).toBeTruthy();
  });
  it("maps error codes to friendly text", () => {
    const t = (k: string) => k;
    expect(ezkErrorMessage("LIMIT", t)).toBe("ezkErr_LIMIT");
    expect(ezkErrorMessage("TIMEOUT", t)).toBeNull();
    expect(fmt("{a} od {b}", { a: 1, b: 2 })).toBe("1 od 2");
  });
});
