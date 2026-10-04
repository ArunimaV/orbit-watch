import { catalogObject, hydrateEvent } from "./socrates";
import type { ConjunctionEvent } from "./types";

const ROW_RE = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
const CELL_RE = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
const NORAD_RE = /^\d{1,9}$/;
const TCA_RE = /\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?/;

interface ObjectRow {
  norad: number;
  name: string;
  dse: number;
  tca: string | null;
  numbers: number[];
}

function decodeCell(raw: string): string {
  return raw
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, value: string) => String.fromCharCode(Number(value)))
    .replace(/\s+/g, " ")
    .trim();
}

function tableRows(html: string): string[][] {
  const rows: string[][] = [];
  for (const match of html.matchAll(ROW_RE)) {
    const cells: string[] = [];
    for (const cell of match[1].matchAll(CELL_RE)) {
      cells.push(decodeCell(cell[1]));
    }
    if (cells.length > 0) rows.push(cells);
  }
  return rows;
}

function objectRow(cells: string[]): ObjectRow | null {
  const noradIndex = cells.findIndex((cell) => NORAD_RE.test(cell) && Number(cell) > 0);
  if (noradIndex < 0) return null;
  const name = cells[noradIndex + 1] ?? "";
  if (!name || NORAD_RE.test(name) || /ops status/i.test(name)) return null;
  const dse = Number(cells[noradIndex + 2]);
  if (!Number.isFinite(dse)) return null;

  let tca: string | null = null;
  const numbers: number[] = [];
  for (const cell of cells.slice(noradIndex + 3)) {
    const stamp = cell.match(TCA_RE);
    if (stamp) {
      tca = stamp[0];
      continue;
    }
    if (!cell) continue;
    const value = Number(cell);
    if (Number.isFinite(value)) numbers.push(value);
  }
  return { norad: Number(cells[noradIndex]), name, dse, tca, numbers };
}

/**
 * SOCRATES search results are an HTML table, two rows per conjunction.
 * The first row carries TCA, miss distance, and relative speed. The second
 * carries max probability and dilution. Shared cells may be rowspan or blank.
 */
export function parseSocratesTable(html: string): ConjunctionEvent[] {
  const rows = tableRows(html).map(objectRow).filter((row): row is ObjectRow => row !== null);
  const events: ConjunctionEvent[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const lead = rows[index];
    const follow = rows[index + 1];
    if (!lead?.tca || !follow || follow.tca) continue;
    if (lead.numbers.length < 2 || follow.numbers.length < 2) continue;
    events.push(
      hydrateEvent({
        object1: catalogObject(lead.norad, lead.name),
        object2: catalogObject(follow.norad, follow.name),
        dse1: lead.dse,
        dse2: follow.dse,
        tca: lead.tca,
        rangeKm: lead.numbers[0],
        relSpeedKms: lead.numbers[1],
        maxProb: follow.numbers[0],
        dilutionKm: follow.numbers[1],
        provenance: "reported",
        syntheticFields: [],
      }),
    );
    index += 1;
  }
  return events;
}

export function socratesPageRecognized(html: string): boolean {
  return /SOCRATES/i.test(html);
}
