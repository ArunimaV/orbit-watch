import fs from "fs";
import path from "path";
import { parseCsv, parseCsvStream } from "./csv";
import type { CatalogObject, ConjunctionEvent, ConjunctionEventInput } from "./types";

export const SOCRATES_COLUMNS = [
  "NORAD_CAT_ID_1",
  "OBJECT_NAME_1",
  "DSE_1",
  "NORAD_CAT_ID_2",
  "OBJECT_NAME_2",
  "DSE_2",
  "TCA",
  "TCA_RANGE",
  "TCA_RELATIVE_SPEED",
  "MAX_PROB",
  "DILUTION",
] as const;

export interface SocratesSnapshot {
  source: "celestrak" | "fixture";
  note?: string;
  fileName: string;
  fileMtime: string;
  ingestedAt: string;
  demoNorad?: number;
  eventCount: number;
  events: ConjunctionEvent[];
  byNorad: Record<string, ConjunctionEvent[]>;
}

export interface LatestPointer {
  snapshot: string;
  fileName: string;
  fileMtime: string;
  ingestedAt: string;
  eventCount: number;
}

export interface JsonDirEntry {
  FILE_NAME: string;
  FILE_SIZE?: number;
  FILE_MTIME: string;
}

export interface JsonDirCheck {
  checkedAt: string;
  error?: string;
  files: JsonDirEntry[];
}

export function socratesPaths(root = process.cwd()) {
  return {
    dir: path.join(root, "data/socrates"),
    latestPath: path.join(root, "data/socrates/latest.json"),
    jsonDirCheckPath: path.join(root, "data/socrates/jsonDir-check.json"),
    fixturePath: path.join(root, "data/fixtures/socrates-sample.json"),
  };
}

const OPS_STATUS = /\[([^\]]+)\]\s*$/;

export function parseObjectName(raw: string): { name: string; opsStatus: string } {
  const trimmed = raw.trim();
  const match = trimmed.match(OPS_STATUS);
  if (!match || match.index === undefined) {
    return { name: trimmed, opsStatus: "" };
  }
  return {
    name: trimmed.slice(0, match.index).trim(),
    opsStatus: match[1].trim(),
  };
}

export function parseTca(raw: string): string {
  const trimmed = raw.trim();
  const isoish = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
  const withZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(isoish) ? isoish : `${isoish}Z`;
  const parsed = new Date(withZone);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Bad TCA: ${raw}`);
  }
  return parsed.toISOString();
}

export function compactTca(tcaIso: string): string {
  return new Date(tcaIso).toISOString().replace(/[-:]/g, "").replace(".", "");
}

/** Id is `ours-other-tca` so the encounter route knows which object is primary. */
export function makeEventId(oursNorad: number, otherNorad: number, tcaIso: string): string {
  return `${oursNorad}-${otherNorad}-${compactTca(tcaIso)}`;
}

export function hydrateEvent(raw: ConjunctionEventInput): ConjunctionEvent {
  const tca = parseTca(raw.tca);
  return {
    ...raw,
    tca,
    syntheticFields: raw.syntheticFields ?? [],
    id: makeEventId(raw.object1.noradId, raw.object2.noradId, tca),
  };
}

export function indexByNorad(events: ConjunctionEvent[]): Record<string, ConjunctionEvent[]> {
  const byNorad: Record<string, ConjunctionEvent[]> = {};
  for (const event of events) {
    for (const norad of [event.object1.noradId, event.object2.noradId]) {
      const key = String(norad);
      (byNorad[key] ??= []).push(event);
    }
  }
  return byNorad;
}

export function catalogObject(noradId: number, rawName: string): CatalogObject {
  const parsed = parseObjectName(rawName);
  return { noradId, name: parsed.name, rawName: rawName.trim(), opsStatus: parsed.opsStatus };
}

function requiredNumber(value: string, label: string): number {
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed)) {
    throw new Error(`Bad ${label}: ${value}`);
  }
  return parsed;
}

export function rowsToEvents(rows: string[][]): ConjunctionEvent[] {
  if (rows.length === 0) return [];
  const header = rows[0].map((cell) => cell.trim());
  const index = new Map(header.map((name, position) => [name, position]));
  for (const column of SOCRATES_COLUMNS) {
    if (!index.has(column)) {
      throw new Error(`SOCRATES CSV is missing column ${column}`);
    }
  }

  const events: ConjunctionEvent[] = [];
  for (const row of rows.slice(1)) {
    if (row.every((cell) => cell.trim() === "")) continue;
    const cell = (column: (typeof SOCRATES_COLUMNS)[number]) => row[index.get(column) ?? -1] ?? "";
    const norad1 = requiredNumber(cell("NORAD_CAT_ID_1"), "NORAD_CAT_ID_1");
    const norad2 = requiredNumber(cell("NORAD_CAT_ID_2"), "NORAD_CAT_ID_2");
    events.push(
      hydrateEvent({
        object1: catalogObject(norad1, cell("OBJECT_NAME_1")),
        object2: catalogObject(norad2, cell("OBJECT_NAME_2")),
        dse1: requiredNumber(cell("DSE_1"), "DSE_1"),
        dse2: requiredNumber(cell("DSE_2"), "DSE_2"),
        tca: cell("TCA"),
        rangeKm: requiredNumber(cell("TCA_RANGE"), "TCA_RANGE"),
        relSpeedKms: requiredNumber(cell("TCA_RELATIVE_SPEED"), "TCA_RELATIVE_SPEED"),
        maxProb: requiredNumber(cell("MAX_PROB"), "MAX_PROB"),
        dilutionKm: requiredNumber(cell("DILUTION"), "DILUTION"),
        provenance: "reported",
        syntheticFields: [],
      }),
    );
  }
  return events;
}

export function parseSocratesCsv(text: string): ConjunctionEvent[] {
  return rowsToEvents(parseCsv(text));
}

export async function parseSocratesCsvStream(stream: ReadableStream<Uint8Array>): Promise<ConjunctionEvent[]> {
  return rowsToEvents(await parseCsvStream(stream));
}

export function buildSnapshot(
  events: ConjunctionEvent[],
  meta: Omit<SocratesSnapshot, "events" | "byNorad" | "eventCount">,
): SocratesSnapshot {
  return {
    ...meta,
    eventCount: events.length,
    events,
    byNorad: indexByNorad(events),
  };
}

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
}

export function snapshotFromJson(value: unknown): SocratesSnapshot {
  if (!value || typeof value !== "object") {
    throw new Error("SOCRATES snapshot is not a JSON object");
  }
  const record = value as Partial<SocratesSnapshot> & { events?: ConjunctionEventInput[] };
  const rawEvents = Array.isArray(record.events) ? record.events : flattenByNorad(record.byNorad);
  const events = rawEvents.map((event) => hydrateEvent(event));
  return buildSnapshot(events, {
    source: record.source === "celestrak" ? "celestrak" : "fixture",
    note: record.note,
    fileName: record.fileName ?? "socrates.json",
    fileMtime: record.fileMtime ?? "",
    ingestedAt: record.ingestedAt ?? new Date(0).toISOString(),
    demoNorad: record.demoNorad,
  });
}

function flattenByNorad(byNorad: SocratesSnapshot["byNorad"] | undefined): ConjunctionEventInput[] {
  if (!byNorad) return [];
  const seen = new Set<string>();
  const events: ConjunctionEventInput[] = [];
  for (const list of Object.values(byNorad)) {
    for (const event of list) {
      const key = `${event.object1.noradId}-${event.object2.noradId}-${event.tca}`;
      if (seen.has(key)) continue;
      seen.add(key);
      events.push(event);
    }
  }
  return events;
}

export function readSnapshotFile(filePath: string): SocratesSnapshot {
  return snapshotFromJson(readJson(filePath));
}

export function loadFixtureSnapshot(root = process.cwd()): SocratesSnapshot {
  return readSnapshotFile(socratesPaths(root).fixturePath);
}

export function readLatestPointer(root = process.cwd()): LatestPointer | null {
  const latestPath = socratesPaths(root).latestPath;
  if (!fs.existsSync(latestPath)) return null;
  return readJson(latestPath) as LatestPointer;
}

export function readJsonDirCheck(root = process.cwd()): JsonDirCheck | null {
  const filePath = socratesPaths(root).jsonDirCheckPath;
  if (!fs.existsSync(filePath)) return null;
  return readJson(filePath) as JsonDirCheck;
}

/**
 * Live snapshot when one has been ingested, otherwise the committed fixture.
 * ORBIT_WATCH_OFFLINE=1 always uses the fixture.
 */
export function loadConjunctionSource(root = process.cwd()): {
  snapshot: SocratesSnapshot;
  source: "snapshot" | "fixture";
} {
  const offline = process.env.ORBIT_WATCH_OFFLINE === "1";
  if (!offline) {
    const latest = readLatestPointer(root);
    if (latest) {
      const snapshotPath = path.join(socratesPaths(root).dir, latest.snapshot);
      if (fs.existsSync(snapshotPath)) {
        return { snapshot: readSnapshotFile(snapshotPath), source: "snapshot" };
      }
    }
  }
  return { snapshot: loadFixtureSnapshot(root), source: "fixture" };
}

export function eventsForNorad(snapshot: SocratesSnapshot, norad: number): ConjunctionEvent[] {
  return snapshot.byNorad[String(norad)] ?? [];
}

export function findEventById(
  snapshot: SocratesSnapshot,
  id: string,
): { event: ConjunctionEvent; oursNorad: number; otherNorad: number } | null {
  const match = /^(\d+)-(\d+)-(.+)$/.exec(id);
  if (!match) return null;
  const oursNorad = Number(match[1]);
  const otherNorad = Number(match[2]);
  const compact = match[3];
  const event = snapshot.events.find((candidate) => {
    const ids = [candidate.object1.noradId, candidate.object2.noradId];
    return ids.includes(oursNorad) && ids.includes(otherNorad) && compactTca(candidate.tca) === compact;
  });
  if (!event) return null;
  return { event, oursNorad, otherNorad };
}

export function snapshotFileName(fileMtime: string): string {
  const parsed = new Date(fileMtime.trim().replace(/ UTC$/i, "Z").replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Bad FILE_MTIME: ${fileMtime}`);
  }
  const stamp = parsed.toISOString().replace(/:/g, "-").replace(/\.\d{3}Z$/, "Z");
  return `${stamp}.json`;
}
