// @vitest-environment node
import { describe, expect, it } from "vitest";
import { eupRulesUrl } from "./ParcelPanel";
describe("eupRulesUrl", () => {
  it("searches code with the municipality", () => {
    const u = new URL(eupRulesUrl("CE28", "Tehnična posodobitev grafičnega prikaza namenske rabe prostora Občinskega prostorskega načrta Mestne občine Ptuj"));
    expect(u.searchParams.get("q")).toBe("CE28 Mestne občine Ptuj odlok OPN");
    expect(new URL(eupRulesUrl("BI06-2", "Občinski prostorski načrt Občine Vransko")).searchParams.get("q")).toBe("BI06-2 Občine Vransko odlok OPN");
  });
});
