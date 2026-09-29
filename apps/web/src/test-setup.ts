import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { configure } from "@testing-library/react";
// Full parallel runs are slower than isolated ones; 1 s default is too tight for flow tests.
configure({ asyncUtilTimeout: 3000 });
// jsdom lacks matchMedia (Mantine color scheme / modals use it).
if (typeof window !== "undefined") {
  window.matchMedia ||= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as never;
}
globalThis.ResizeObserver ||= class { observe() {} unobserve() {} disconnect() {} } as never;
