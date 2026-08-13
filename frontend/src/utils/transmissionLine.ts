/**
 * Feed-chain transmission-line cascade — models the real signal path
 * between the antenna's NEC2 feedpoint and wherever a scan was actually
 * taken (window line, balun, coax runs), instead of the single ideal
 * ratio applyMatching() uses.
 *
 * Method: each line segment is a lossy transmission line with complex
 * propagation constant gamma = alpha + j*beta; each transformer (balun)
 * is an ideal impedance-ratio stage. Impedance is walked stage-by-stage
 * from the antenna feedpoint (the "load") toward the analyzer using the
 * standard lossy-line input-impedance formula — equivalent to cascading
 * each stage's ABCD matrix, but without needing explicit matrix algebra
 * since stages are a simple series chain (no branches).
 *
 * Reference: Z_in = Z0 * (Z_L*cosh(gamma*L) + Z0*sinh(gamma*L))
 *                      / (Z0*cosh(gamma*L) + Z_L*sinh(gamma*L))
 */

import type { MatchingConfig } from "./units";
import { applyMatching, computeSwr } from "./units";

// ---- Complex arithmetic (minimal, just what the cascade needs) ----

interface Complex {
  re: number;
  im: number;
}

function cAdd(a: Complex, b: Complex): Complex {
  return { re: a.re + b.re, im: a.im + b.im };
}
function cMul(a: Complex, b: Complex): Complex {
  return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
}
function cDiv(a: Complex, b: Complex): Complex {
  const denom = b.re * b.re + b.im * b.im;
  if (denom < 1e-30) return { re: 0, im: 0 };
  return {
    re: (a.re * b.re + a.im * b.im) / denom,
    im: (a.im * b.re - a.re * b.im) / denom,
  };
}
/** cosh(x+jy) = cosh(x)cos(y) + j*sinh(x)sin(y) */
function cCosh(z: Complex): Complex {
  return { re: Math.cosh(z.re) * Math.cos(z.im), im: Math.sinh(z.re) * Math.sin(z.im) };
}
/** sinh(x+jy) = sinh(x)cos(y) + j*cosh(x)sin(y) */
function cSinh(z: Complex): Complex {
  return { re: Math.sinh(z.re) * Math.cos(z.im), im: Math.cosh(z.re) * Math.sin(z.im) };
}

const C_LIGHT = 299792458; // m/s
const FT_TO_M = 0.3048;

// ---- Cable presets ----
// Approximate, commonly-published reference figures (velocity factor,
// loss in dB/100ft at 30 MHz, scaled with sqrt(f/30) for higher/lower
// frequencies — the standard conductor-loss scaling for coax). These are
// NOT verified against any specific manufacturer batch — swap in real
// datasheet numbers via "Custom" if you have them; the fit-quality number
// on the charts is the actual arbiter of whether these are close enough.
export interface CablePreset {
  label: string;
  z0: number;
  velocityFactor: number;
  lossDb100ftAt30Mhz: number;
}

export const CABLE_PRESETS: Record<string, CablePreset> = {
  "lmr400": { label: "LMR-400", z0: 50, velocityFactor: 0.85, lossDb100ftAt30Mhz: 1.4 },
  "lmr240": { label: "LMR-240", z0: 50, velocityFactor: 0.80, lossDb100ftAt30Mhz: 3.9 },
  "lmr600": { label: "LMR-600", z0: 50, velocityFactor: 0.87, lossDb100ftAt30Mhz: 0.8 },
  "rg213": { label: "RG-213", z0: 50, velocityFactor: 0.66, lossDb100ftAt30Mhz: 1.6 },
  "rg8x": { label: "RG-8X", z0: 50, velocityFactor: 0.78, lossDb100ftAt30Mhz: 2.7 },
  "rg58": { label: "RG-58", z0: 50, velocityFactor: 0.66, lossDb100ftAt30Mhz: 4.5 },
  "ladder450": { label: "450Ω Ladder Line", z0: 450, velocityFactor: 0.95, lossDb100ftAt30Mhz: 0.1 },
  "twinlead300": { label: "300Ω Twin-Lead", z0: 300, velocityFactor: 0.80, lossDb100ftAt30Mhz: 0.5 },
  "custom": { label: "Custom", z0: 50, velocityFactor: 0.85, lossDb100ftAt30Mhz: 1.0 },
};

// ---- Feed-chain stage model ----

export type FeedChainStageType = "line" | "balun";

export interface FeedChainStage {
  id: string;
  label: string;
  type: FeedChainStageType;
  enabled: boolean;
  /** line stages */
  cablePreset?: string; // key into CABLE_PRESETS, "custom" for hand-entered
  lengthFt?: number;
  z0?: number;
  velocityFactor?: number;
  lossDb100ftAt30Mhz?: number;
  /** balun stages */
  ratio?: number; // impedance ratio N:1 (e.g. 4 for 4:1)
}

/** Transform impedance ZL (at the deep/antenna end of one stage) to the impedance at its shallow/analyzer end. */
function transformThroughStage(freqMhz: number, zl: Complex, stage: FeedChainStage): Complex {
  if (!stage.enabled) return zl;

  if (stage.type === "balun") {
    const ratio = stage.ratio && stage.ratio > 0 ? stage.ratio : 1;
    return { re: zl.re / ratio, im: zl.im / ratio };
  }

  // type === "line"
  const lengthFt = stage.lengthFt ?? 0;
  if (lengthFt <= 0) return zl;
  const z0 = stage.z0 ?? 50;
  const vf = stage.velocityFactor ?? 0.85;
  const lossRef = stage.lossDb100ftAt30Mhz ?? 0;

  const lengthM = lengthFt * FT_TO_M;
  const freqHz = freqMhz * 1e6;

  // beta = 2*pi*f / (v_f * c)
  const beta = (2 * Math.PI * freqHz) / (vf * C_LIGHT);

  // Attenuation scales ~sqrt(f) for coax conductor loss; scale the 30 MHz
  // reference figure accordingly, convert dB/100ft -> Nepers/m.
  const freqScale = Math.sqrt(Math.max(freqMhz, 0.01) / 30);
  const lossDbPerFt = (lossRef * freqScale) / 100;
  const lossDbPerM = lossDbPerFt / FT_TO_M;
  const alpha = lossDbPerM / 8.686; // Nepers/m = dB/m / 8.686

  const gammaL: Complex = { re: alpha * lengthM, im: beta * lengthM };
  const coshGL = cCosh(gammaL);
  const sinhGL = cSinh(gammaL);
  const z0c: Complex = { re: z0, im: 0 };

  // Z_in = Z0 * (ZL*cosh(gL) + Z0*sinh(gL)) / (Z0*cosh(gL) + ZL*sinh(gL))
  const numerator = cAdd(cMul(zl, coshGL), cMul(z0c, sinhGL));
  const denominator = cAdd(cMul(z0c, coshGL), cMul(zl, sinhGL));
  return cMul(z0c, cDiv(numerator, denominator));
}

export interface FeedChainConfig {
  enabled: boolean;
  stages: FeedChainStage[];
  /** How many stages (counting only enabled ones, in order) to apply before reporting Z. */
  tapIndex: number;
}

/** The enabled stages, in order — what tapIndex actually walks through. */
export function enabledStages(stages: FeedChainStage[]): FeedChainStage[] {
  return stages.filter((s) => s.enabled);
}

/** Human-readable tap points, one per position in the enabled-stage chain (0 = raw antenna feedpoint). */
export function tapLabels(stages: FeedChainStage[]): string[] {
  const en = enabledStages(stages);
  return ["Antenna Feedpoint (raw)", ...en.map((s) => `After ${s.label}`)];
}

/**
 * Tap points keyed by stage id (null = raw antenna feedpoint) rather than
 * numeric position — stable across enabling/disabling other stages, since
 * a positional index silently points at a different physical location
 * when a stage earlier in the chain is toggled.
 */
export function tapOptions(stages: FeedChainStage[]): { id: string | null; label: string }[] {
  const en = enabledStages(stages);
  return [
    { id: null, label: "Antenna Feedpoint (raw)" },
    ...en.map((s) => ({ id: s.id, label: `After ${s.label}` })),
  ];
}

/** Convert a tap stage id (null = raw feedpoint) to the numeric tapIndex applyFeedChain expects. */
export function tapIndexForStageId(stages: FeedChainStage[], tapStageId: string | null): number {
  if (tapStageId === null) return 0;
  const en = enabledStages(stages);
  const idx = en.findIndex((s) => s.id === tapStageId);
  return idx === -1 ? en.length : idx + 1;
}

/** Walk the antenna feedpoint impedance through the feed chain up to tapIndex, at a given frequency. */
export function applyFeedChain(
  freqMhz: number,
  rawReal: number,
  rawImag: number,
  config: FeedChainConfig
): { real: number; imag: number; swr: number; z0: number } {
  const en = enabledStages(config.stages);
  const tapIndex = Math.max(0, Math.min(config.tapIndex, en.length));

  let z: Complex = { re: rawReal, im: rawImag };
  let z0AtTap = 50; // default reference until a line stage sets it
  for (let i = 0; i < tapIndex; i++) {
    const stage = en[i]!;
    z = transformThroughStage(freqMhz, z, stage);
    if (stage.type === "line" && stage.z0) z0AtTap = stage.z0;
  }

  return { real: z.re, imag: z.im, swr: computeSwr(z.re, z.im, z0AtTap), z0: z0AtTap };
}

/**
 * Resolve the displayed impedance/SWR for a chart: routes through the
 * feed-chain cascade when it's enabled, otherwise falls back to the
 * existing simple ideal-ratio matching — a drop-in replacement for
 * applyMatching() at each chart's call site.
 */
export function resolveMatch(
  freqMhz: number,
  rawReal: number,
  rawImag: number,
  matching: MatchingConfig,
  feedChain?: FeedChainConfig
): { real: number; imag: number; swr: number; z0: number } {
  if (feedChain?.enabled) {
    return applyFeedChain(freqMhz, rawReal, rawImag, feedChain);
  }
  const m = applyMatching(rawReal, rawImag, matching);
  return { ...m, z0: matching.feedlineZ0 };
}
