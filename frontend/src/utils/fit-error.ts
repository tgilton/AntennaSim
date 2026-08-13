/**
 * RMS error between a simulated R/X curve and an imported measured
 * (.s1p / RigExpert CSV) reference trace — a numeric "how close is the
 * model" readout to accompany the visual chart overlay.
 */

import type { FrequencyResult } from "../api/nec";
import type { S1PDataPoint } from "./s1p-parser";
import type { MatchingConfig } from "./units";
import type { FeedChainConfig } from "./transmissionLine";
import { resolveMatch } from "./transmissionLine";

/** Linear-interpolate a measured trace (sorted by frequency) onto an arbitrary frequency (MHz). Null outside its range. */
function interpolateMeasured(points: S1PDataPoint[], freqMhz: number): { r: number; x: number } | null {
  if (points.length === 0) return null;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (freqMhz < first.frequency_mhz || freqMhz > last.frequency_mhz) return null;

  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid]!.frequency_mhz <= freqMhz) lo = mid;
    else hi = mid;
  }
  const p0 = points[lo]!;
  const p1 = points[hi]!;
  if (p1.frequency_mhz === p0.frequency_mhz) return { r: p0.impedance_real, x: p0.impedance_imag };
  const t = (freqMhz - p0.frequency_mhz) / (p1.frequency_mhz - p0.frequency_mhz);
  return {
    r: p0.impedance_real + t * (p1.impedance_real - p0.impedance_real),
    x: p0.impedance_imag + t * (p1.impedance_imag - p0.impedance_imag),
  };
}

export interface FitError {
  rmsOhm: number;
  sampleCount: number;
}

/**
 * RMS error over the simulated curve's own frequency points, sampled
 * against the measured trace within its overlapping range. `matching` is
 * applied to the simulated impedance first, so the comparison is against
 * whatever tap point (raw feedpoint vs. post-balun) the chart is showing.
 */
export function computeFitError(
  simulated: FrequencyResult[],
  measured: S1PDataPoint[],
  matching: MatchingConfig,
  feedChain?: FeedChainConfig
): FitError | null {
  if (simulated.length === 0 || measured.length === 0) return null;
  let sumSq = 0;
  let n = 0;
  for (const s of simulated) {
    const m = interpolateMeasured(measured, s.frequency_mhz);
    if (m === null) continue;
    const sim = resolveMatch(s.frequency_mhz, s.impedance.real, s.impedance.imag, matching, feedChain);
    const dr = sim.real - m.r;
    const dx = sim.imag - m.x;
    sumSq += dr * dr + dx * dx;
    n++;
  }
  if (n === 0) return null;
  return { rmsOhm: Math.sqrt(sumSq / n), sampleCount: n };
}
