import { northUpHash, keepNorthUp, NORTH_UP_OPTIONS } from "./camera";

it("preserves the location and zoom in old rotated/tilted links", () => {
  expect(northUpHash("#17/46.55/15.65/90/45")).toBe("#17/46.55/15.65");
  expect(northUpHash("#17/46.55/15.65")).toBe("#17/46.55/15.65");
  expect(northUpHash("#other")).toBe("#other");
});
it("disables rotation without disabling touch zoom or keyboard navigation", () => {
  const map = { touchZoomRotate: { disableRotation: vi.fn(), disable: vi.fn() }, keyboard: { disableRotation: vi.fn(), disable: vi.fn() } };
  keepNorthUp(map);
  expect(map.touchZoomRotate.disableRotation).toHaveBeenCalledOnce();
  expect(map.keyboard.disableRotation).toHaveBeenCalledOnce();
  expect(map.touchZoomRotate.disable).not.toHaveBeenCalled();
  expect(map.keyboard.disable).not.toHaveBeenCalled();
  expect(NORTH_UP_OPTIONS).toMatchObject({ dragRotate: false, touchPitch: false, maxPitch: 0, bearing: 0, pitch: 0 });
});
