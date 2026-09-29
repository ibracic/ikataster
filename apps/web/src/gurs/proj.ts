import proj4 from "proj4";

// Slovenian national grid D96/TM
proj4.defs("EPSG:3794", "+proj=tmerc +lat_0=0 +lon_0=15 +k=0.9999 +x_0=500000 +y_0=-5000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");

export function toD96(lon: number, lat: number): [number, number] {
  return proj4("EPSG:4326", "EPSG:3794", [lon, lat]) as [number, number];
}
export function fromD96(e: number, n: number): [number, number] {
  return proj4("EPSG:3794", "EPSG:4326", [e, n]) as [number, number];
}
