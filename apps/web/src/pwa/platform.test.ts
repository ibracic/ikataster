import { detectPlatform, installHint } from "./platform";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME = "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0 Mobile/15E148 Safari/604.1";
const IPAD = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 16; Pixel 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36";
const DESKTOP = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";

it("detects platforms incl. iPadOS desktop UA", () => {
  expect(detectPlatform(IPHONE)).toBe("ios-safari");
  expect(detectPlatform(IPHONE_CHROME)).toBe("ios-other");
  expect(detectPlatform(IPAD, 5)).toBe("ios-safari");
  expect(detectPlatform(IPAD, 0)).toBe("desktop");
  expect(detectPlatform(ANDROID)).toBe("android");
  expect(detectPlatform(DESKTOP)).toBe("desktop");
});

it("chooses the install hint once, never when installed or dismissed", () => {
  const base = { standalone: false, dismissed: false, canPrompt: false };
  expect(installHint({ ...base, platform: "ios-safari" })).toBe("ios");
  expect(installHint({ ...base, platform: "ios-other" })).toBe("ios-other");
  expect(installHint({ ...base, platform: "ios-safari", dismissed: true })).toBeNull();
  expect(installHint({ ...base, platform: "ios-safari", standalone: true })).toBeNull();
  expect(installHint({ ...base, platform: "android" })).toBeNull();
  expect(installHint({ ...base, platform: "android", canPrompt: true })).toBe("prompt");
  expect(installHint({ ...base, platform: "desktop", canPrompt: true })).toBe("prompt");
});
