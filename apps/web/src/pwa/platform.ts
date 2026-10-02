import { SETTINGS } from "../data/inventory";
export type Platform = "ios-safari" | "ios-other" | "android" | "desktop";

/** iPadOS 13+ reports a Mac UA; touch points tell them apart. */
export function detectPlatform(ua: string, maxTouchPoints = 0): Platform {
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
  if (ios) return /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) ? "ios-other" : "ios-safari";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}
export const isMobile = (p: Platform) => p !== "desktop";

export const HINT_KEY = SETTINGS.installHint;

export type Hint = "ios" | "ios-other" | "prompt" | null;
/**
 * Which install hint to show: installed apps and dismissed hints show nothing; iOS Safari gets
 * "Share → Add to Home Screen" (protects data from the 7-day eviction), other iOS browsers are told
 * to open Safari, and browsers that fired beforeinstallprompt get an install button.
 */
export function installHint(o: { platform: Platform; standalone: boolean; dismissed: boolean; canPrompt: boolean }): Hint {
  if (o.standalone || o.dismissed) return null;
  if (o.platform === "ios-safari") return "ios";
  if (o.platform === "ios-other") return "ios-other";
  if (o.canPrompt) return "prompt";
  return null;
}

export function currentPlatform(): Platform {
  if (typeof navigator === "undefined") return "desktop";
  return detectPlatform(navigator.userAgent, navigator.maxTouchPoints ?? 0);
}
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}
