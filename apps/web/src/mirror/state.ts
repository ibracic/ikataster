/** Set when GURS is known to be unreachable (probe failed, e.g. outside Slovenia): lookups then go straight to the mirror. */
let down = false;
export const setGursDown = (v: boolean) => { down = v; };
export const gursDown = () => down;
