/**
 * Parser for RigExpert AntScope CSV exports — a ground-truth R/X/SWR-vs-
 * frequency scan to overlay against simulated results, same role as the
 * .s1p VNA import (see s1p-parser.ts) but for a RigExpert-style CSV
 * instead of a Touchstone file. Produces the same S1PFile/S1PDataPoint
 * shape so it flows through the existing overlay plumbing unchanged.
 *
 * Tolerant of the row shapes analyzer export software tends to produce:
 * a header row naming columns in any order/wording, comma or semicolon
 * delimiters (some locales use ';' with decimal commas), and frequency
 * in either kHz or MHz. Falls back to positional freq,R,X columns if no
 * recognizable header is present.
 */

import type { S1PDataPoint, S1PFile } from "./s1p-parser";

const HEADER_KEYWORDS: Record<string, string[]> = {
  freq: ["frequency", "freq", "f,", "f "],
  r: ["r,", "r(", " r", "resistance", "rs,"],
  x: ["x,", "x(", " x", "reactance"],
  swr: ["swr", "vswr"],
};

function detectDelimiter(line: string): string {
  const commaCount = (line.match(/,/g) ?? []).length;
  const semiCount = (line.match(/;/g) ?? []).length;
  const tabCount = (line.match(/\t/g) ?? []).length;
  if (tabCount >= commaCount && tabCount >= semiCount) return "\t";
  if (semiCount > commaCount) return ";";
  return ",";
}

function toNumber(raw: string): number | null {
  const cleaned = raw.trim().replace(/^"|"$/g, "");
  const normalized = cleaned.includes(",") && !cleaned.includes(".") ? cleaned.replace(",", ".") : cleaned;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function classifyHeader(cell: string): "freq" | "r" | "x" | "swr" | null {
  const lower = cell.toLowerCase();
  for (const [key, needles] of Object.entries(HEADER_KEYWORDS)) {
    if (needles.some((n) => lower.includes(n))) return key as "freq" | "r" | "x" | "swr";
  }
  return null;
}

/**
 * Compute SWR from R/X against a reference impedance — same formula as
 * s1p-parser's s11ToResults, applied directly to measured R/X instead of
 * going through a reflection-coefficient intermediate.
 */
function swrFromRX(r: number, x: number, z0: number): number {
  const numMag = Math.hypot(r - z0, x);
  const denomMag = Math.hypot(r + z0, x);
  if (denomMag === 0) return 999;
  const gamma = numMag / denomMag;
  if (gamma >= 1) return 999;
  return Math.min((1 + gamma) / (1 - gamma), 999);
}

export interface ParsedRigExpertCsv {
  file: S1PFile;
  warnings: string[];
}

/** Parse raw pasted/uploaded RigExpert (or similar analyzer) CSV scan text. */
export function parseRigExpertCsv(content: string, filename: string, z0 = 50): ParsedRigExpertCsv {
  const warnings: string[] = [];
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));

  if (lines.length === 0) {
    return { file: { z0, data: [], filename }, warnings: ["No data found."] };
  }

  const delimiter = detectDelimiter(lines[0]!);
  const firstCells = lines[0]!.split(delimiter).map((c) => c.trim());
  const headerMap = firstCells.map(classifyHeader);
  const hasHeader = headerMap.some((c) => c !== null);

  let colFreq = 0;
  let colR: number | null = 1;
  let colX: number | null = 2;
  let colSwr: number | null = null;
  let dataStart = 0;

  if (hasHeader) {
    dataStart = 1;
    const freqIdx = headerMap.findIndex((c) => c === "freq");
    const rIdx = headerMap.findIndex((c) => c === "r");
    const xIdx = headerMap.findIndex((c) => c === "x");
    const swrIdx = headerMap.findIndex((c) => c === "swr");
    if (freqIdx >= 0) colFreq = freqIdx;
    colR = rIdx >= 0 ? rIdx : null;
    colX = xIdx >= 0 ? xIdx : null;
    colSwr = swrIdx >= 0 ? swrIdx : null;
    if (colR === null || colX === null) {
      if (colSwr === null) {
        warnings.push("Could not identify R/X columns from header; falling back to positional freq,R,X.");
        colR = 1;
        colX = 2;
      }
    }
  } else {
    warnings.push("No header row detected — assuming column order: frequency, R, X.");
  }

  type Row = { freq: number; r: number | null; x: number | null; swr: number | null };
  const rows: Row[] = [];
  for (let i = dataStart; i < lines.length; i++) {
    const cells = lines[i]!.split(delimiter).map((c) => c.trim());
    if (cells.length < 2) continue;
    const freq = toNumber(cells[colFreq] ?? "");
    if (freq === null) continue;
    const r = colR !== null ? toNumber(cells[colR] ?? "") : null;
    const x = colX !== null ? toNumber(cells[colX] ?? "") : null;
    const swr = colSwr !== null ? toNumber(cells[colSwr] ?? "") : null;
    rows.push({ freq, r, x, swr });
  }

  if (rows.length === 0) {
    return { file: { z0, data: [], filename }, warnings: [...warnings, "No parseable data rows found."] };
  }

  const sortedFreqs = [...rows.map((r) => r.freq)].sort((a, b) => a - b);
  const median = sortedFreqs[Math.floor(sortedFreqs.length / 2)]!;
  const isKhz = median > 1000;
  if (isKhz) warnings.push(`Frequency column looks like kHz (median ${median.toFixed(0)}) — converted to MHz.`);

  const data: S1PDataPoint[] = rows
    .filter((row) => row.r !== null && row.x !== null)
    .map((row) => {
      const freqMhz = isKhz ? row.freq / 1000 : row.freq;
      const r = row.r as number;
      const x = row.x as number;
      return {
        frequency_mhz: freqMhz,
        impedance_real: r,
        impedance_imag: x,
        swr: row.swr ?? swrFromRX(r, x, z0),
      };
    })
    .sort((a, b) => a.frequency_mhz - b.frequency_mhz);

  if (data.length === 0) {
    warnings.push("R/X columns were empty or unparseable — nothing to overlay.");
  }

  return { file: { z0, data, filename }, warnings };
}
