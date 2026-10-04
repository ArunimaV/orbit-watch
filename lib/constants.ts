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
  43017: {
    name: "AO-91",
    detail: "AMSAT Fox-1B · 1U",
  },
  69794: {
    name: "HUCSat",
    detail: "Harvard 2U",
  },
  39161: {
    name: "ESTCube-1",
    detail: "University of Tartu 1U",
  },
};

/** Short list for the header. SwissCube stays the default and is not in here. */
export const TRACKABLE_CUBESATS = [
  { norad: 43017, name: "AO-91", detail: "AMSAT Fox-1B · 1U" },
  { norad: 69794, name: "HUCSat", detail: "Harvard 2U" },
  { norad: 39161, name: "ESTCube-1", detail: "University of Tartu 1U" },
] as const;
