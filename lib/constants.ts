/** Demo satellite: SwissCube, EPFL's 1U CubeSat. ISS remains a secondary example. */
export const DEMO_NORAD = 35932;
/** Default encounter on the globe: SwissCube vs SL-8 DEB. */
export const DEMO_ENCOUNTER_NORAD = 19831;
export const ISS_NORAD = 25544;
export const DEFAULT_HORIZON_HOURS = 24 * 7;

export const KNOWN_SATELLITES: Record<number, { name: string; detail: string }> = {
  35932: {
    name: "SwissCube",
    detail: "EPFL 1U CubeSat · ~685 km sun-synchronous · no thrusters",
  },
  25544: {
    name: "ISS (Zarya)",
    detail: "Secondary example from the Oct 3 SOCRATES writeup",
  },
};
