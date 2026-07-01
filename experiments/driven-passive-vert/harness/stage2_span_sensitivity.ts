/**
 * Stage 2: driven/parasitic radial-span sensitivity, crossed with spacing.
 *
 * Three regimes:
 *   - driven_sweep:      driven_radial_span varies, parasitic_radial_span fixed at 180
 *   - parasitic_sweep:   parasitic_radial_span varies, driven_radial_span fixed at 90 (baseline)
 *   - coordinated_sweep: both spans set to the same value together
 *
 * Each regime run across 3 representative spacings from Stage 1 (0.10L, 0.175L, 0.25L),
 * with detune held at the +5% sweet spot found in Stage 1. Tracks gain_max_theta
 * (elevation) on every point to watch for the "radiation angle creeping too high" concern.
 */

import { parasiticVerticalTemplate } from "../../../frontend/src/templates/parasitic-vertical";
import { getDefaultParams } from "../../../frontend/src/templates/types";
import type { WireGeometry } from "../../../frontend/src/templates/types";

const API_URL = "http://localhost:8000/api/v1/simulate";
const PATTERN_STEP = 5;

interface SweepPoint { [key: string]: number }

interface SimResult {
  gain_max_dbi: number | null;
  gain_max_theta: number | null;
  front_to_back_db: number | null;
  swr_50: number | null;
  impedance_real: number | null;
  impedance_imag: number | null;
  warnings: string[];
}

function wireToApi(w: WireGeometry) {
  return { tag: w.tag, segments: w.segments, x1: w.x1, y1: w.y1, z1: w.z1, x2: w.x2, y2: w.y2, z2: w.z2, radius: w.radius };
}

async function simulateOnePoint(paramOverrides: SweepPoint): Promise<SimResult> {
  const params = { ...getDefaultParams(parasiticVerticalTemplate), ...paramOverrides };
  const wires = parasiticVerticalTemplate.generateGeometry(params);
  const excitation = parasiticVerticalTemplate.generateExcitation(params, wires);
  const freq = params.frequency;

  const body = {
    wires: wires.map(wireToApi),
    excitations: [{
      wire_tag: excitation.wire_tag, segment: excitation.segment,
      voltage_real: excitation.voltage_real, voltage_imag: excitation.voltage_imag,
    }],
    ground: { ground_type: "average" },
    frequency: { start_mhz: freq, stop_mhz: freq, steps: 1 },
    pattern: {
      theta_start: -90, theta_stop: 90, theta_step: PATTERN_STEP,
      phi_start: 0, phi_stop: 360 - PATTERN_STEP, phi_step: PATTERN_STEP,
    },
  };

  const resp = await fetch(API_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Simulate failed (${resp.status}): ${text.slice(0, 300)}`);
  }
  const result = await resp.json();
  const fd = result.frequency_data?.[0] ?? {};
  return {
    gain_max_dbi: fd.gain_max_dbi ?? null,
    gain_max_theta: fd.gain_max_theta ?? null,
    front_to_back_db: fd.front_to_back_db ?? null,
    swr_50: fd.swr_50 ?? null,
    impedance_real: fd.impedance?.real ?? null,
    impedance_imag: fd.impedance?.imag ?? null,
    warnings: result.warnings ?? [],
  };
}

async function main() {
  const outPath = process.argv[2] ?? "./stage2_results.csv";
  const wavelength = 300.0 / 14.175;

  const spacingFracs = [0.10, 0.175, 0.25];
  const spanValues = [30, 60, 90, 120, 150, 180];
  const detune = 5.0;

  type Combo = { regime: string; spacing_frac: number; driven_radial_span: number; parasitic_radial_span: number };
  const combos: Combo[] = [];

  for (const sf of spacingFracs) {
    for (const span of spanValues) {
      combos.push({ regime: "driven_sweep", spacing_frac: sf, driven_radial_span: span, parasitic_radial_span: 180 });
      combos.push({ regime: "parasitic_sweep", spacing_frac: sf, driven_radial_span: 90, parasitic_radial_span: span });
      combos.push({ regime: "coordinated_sweep", spacing_frac: sf, driven_radial_span: span, parasitic_radial_span: span });
    }
  }

  console.log(`Running ${combos.length} combinations...`);
  const resultKeys: (keyof SimResult)[] = ["gain_max_dbi", "gain_max_theta", "front_to_back_db", "swr_50", "impedance_real", "impedance_imag"];
  const header = ["regime", "spacing_frac", "driven_radial_span", "parasitic_radial_span", ...resultKeys, "warnings"].join(",");
  const rows: (string | null)[] = new Array(combos.length).fill(null);

  const concurrency = 6;
  let completed = 0;
  async function worker(startIdx: number) {
    for (let i = startIdx; i < combos.length; i += concurrency) {
      const c = combos[i]!;
      try {
        const r = await simulateOnePoint({
          parasitic_spacing: Math.round(c.spacing_frac * wavelength * 1000) / 1000,
          parasitic_detune: detune,
          driven_radial_span: c.driven_radial_span,
          parasitic_radial_span: c.parasitic_radial_span,
        });
        rows[i] = [c.regime, c.spacing_frac, c.driven_radial_span, c.parasitic_radial_span, ...resultKeys.map((k) => r[k]), `"${r.warnings.join(";")}"`].join(",");
      } catch (e) {
        rows[i] = [c.regime, c.spacing_frac, c.driven_radial_span, c.parasitic_radial_span, "ERROR", "", "", "", "", "", `"${String(e).slice(0, 200)}"`].join(",");
      }
      completed++;
      if (completed % 10 === 0 || completed === combos.length) console.log(`  ${completed}/${combos.length}`);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, (_, i) => worker(i)));

  const fs = await import("fs");
  fs.writeFileSync(outPath, [header, ...rows.filter((r): r is string => r !== null)].join("\n") + "\n");
  console.log(`Wrote ${combos.length} rows to ${outPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
