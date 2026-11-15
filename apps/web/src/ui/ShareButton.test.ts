// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { shareLink } from "./ShareButton";

describe("shareLink", () => {
  it("copies to clipboard on desktop", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const nav = { clipboard: { writeText }, share: vi.fn() } as unknown as Navigator;
    expect(await shareLink("https://x/?ko=1&st=2", "t", nav)).toBe("copied");
    expect(writeText).toHaveBeenCalledWith("https://x/?ko=1&st=2");
  });
  it("reports failure when clipboard is blocked", async () => {
    const nav = { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("no")) } } as unknown as Navigator;
    expect(await shareLink("u", "t", nav)).toBe("failed");
  });
});
