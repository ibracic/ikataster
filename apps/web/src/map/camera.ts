/** Cadastre maps stay flat and north-up; pan, pinch/scroll zoom and keyboard navigation remain enabled. */
export const NORTH_UP_OPTIONS = {
  bearing: 0, pitch: 0, minPitch: 0, maxPitch: 0,
  dragRotate: false, pitchWithRotate: false, touchPitch: false,
} as const;

/** Strip legacy camera angles before MapLibre validates the hash against maxPitch=0. */
export function northUpHash(hash: string): string {
  const fields = hash.replace(/^#/, "").split("/");
  return fields.length >= 4 && fields.length <= 5 && fields.every((v) => v.trim() !== "" && Number.isFinite(Number(v)))
    ? `#${fields.slice(0, 3).join("/")}` : hash;
}

export function keepNorthUp(map: {
  touchZoomRotate: { disableRotation(): void };
  keyboard: { disableRotation(): void };
}) {
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
}
