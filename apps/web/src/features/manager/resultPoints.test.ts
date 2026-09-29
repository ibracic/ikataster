import { resultPoints } from "./ManagerPanel";

it("one marker per building with an outline, at its centre, labelled with the part count", () => {
  const sq = { type: "Polygon" as const, coordinates: [[[15, 46], [15.2, 46], [15.2, 46.2], [15, 46.2], [15, 46]]] };
  const fc = resultPoints([{ koId: 657, number: 1, parts: [1, 2, 3] }, { koId: 657, number: 2, parts: [1] }], new Map([["657:1", sq]]));
  expect(fc.features).toHaveLength(1);
  expect(fc.features[0].geometry.coordinates).toEqual([15.1, 46.1]);
  expect(fc.features[0].properties).toEqual({ ko: 657, n: 1, parts: 3 });
});
