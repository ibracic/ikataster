import { bridgeMode, BRIDGE_LS } from "./instance";

describe("bridgeMode", () => {
  beforeEach(() => localStorage.clear());
  it("defaults to the real extension", () => expect(bridgeMode("")).toBe("extension"));
  it("?bridge=mock selects and remembers the mock transport", () => {
    expect(bridgeMode("?bridge=mock")).toBe("mock");
    expect(localStorage.getItem(BRIDGE_LS)).toBe("mock");
    expect(bridgeMode("")).toBe("mock");
  });
  it("?bridge=extension switches back", () => {
    bridgeMode("?bridge=mock");
    expect(bridgeMode("?bridge=extension")).toBe("extension");
    expect(bridgeMode("")).toBe("extension");
  });
});
