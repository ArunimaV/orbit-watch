export interface CatalogObject {
  noradId: number;
  name: string;
  rawName: string;
  opsStatus: string;
}

/**
 * One SOCRATES close approach, before "ours" is chosen.
 * Fields listed in `syntheticFields` were not in the supplied excerpt.
 */
export interface ConjunctionEvent {
  id: string;
  object1: CatalogObject;
  object2: CatalogObject;
  dse1: number | null;
  dse2: number | null;
  tca: string;
  rangeKm: number;
  relSpeedKms: number;
  maxProb: number | null;
  dilutionKm: number | null;
  provenance: "reported" | "partial" | "synthetic" | "secondary-example";
  syntheticFields: string[];
  note?: string;
}

export type ConjunctionEventInput = Omit<ConjunctionEvent, "id"> & { id?: string };

export type Tier = "Act" | "Watch" | "Info";

export interface ScoreBreakdown {
  p: number;
  r: number;
  v: number;
  t: number;
  s: number;
  score: number;
}

export interface ConfidenceFlags {
  stale: boolean;
  diluted: boolean;
  staleDays: number | null;
}

export interface RankedEvent {
  id: string;
  ours: CatalogObject;
  other: CatalogObject;
  tca: string;
  rangeKm: number;
  relSpeedKms: number;
  maxProb: number | null;
  dilutionKm: number | null;
  dseOurs: number | null;
  dseOther: number | null;
  score: number;
  breakdown: ScoreBreakdown;
  tier: Tier;
  flags: ConfidenceFlags;
  passes: number;
  hoursToTca: number;
  provenance: ConjunctionEvent["provenance"];
  syntheticFields: string[];
  note?: string;
}

export interface DismissedExample {
  id: string;
  otherNorad: number;
  otherName: string;
  otherOpsStatus: string;
  tca: string;
  rangeKm: number;
  relSpeedKms: number;
  maxProb: number | null;
  passes: number;
  detail?: string;
}

export interface DismissedGroup {
  reason: string;
  count: number;
  examples: DismissedExample[];
}

export interface RankResult {
  ranked: RankedEvent[];
  dismissed: DismissedGroup[];
}
