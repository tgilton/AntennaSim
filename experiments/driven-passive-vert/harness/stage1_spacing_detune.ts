/**
 * Parameter-space sweep harness for the Parasitic Vertical Array template.
 *
 * Imports the REAL template code (generateGeometry, generateExcitation) so every
 * simulated point is guaranteed identical to what the AntennaSim UI would produce --
 * no hand-reimplemented geometry math, no drift risk.
 *
 * Usage: run via esbuild-bundled node script (see run_sweep.sh in the same directory).
 * Writes a CSV with one row per parameter combination to the given output path.
 */

import { parasiticVerticalTemplate } from "../../../frontend/src/templates/parasitic-vertical";
import { getDefaultParams } from "../../../frontend/src/templates/types";
import type { WireGeometry } from "../../../frontend/src/templates/types";

const API_URL = "http://localhost:8000/api/v1/simulate";
const PATTERN_STEP = 5; // matches the app's default frontend request (src/api/nec.ts)

interface SweepPoint {
  [key: string]: number;
}

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
  return {
    tag: w.tag, segments: w.segments,
    x1: w.x1, y1: w.y1, z1: w.z1,
    x2: w.x2, y2: w.y2, z2: w.z2,
    radius: w.radius,
  };
}

async function simulateOnePoint(paramOverrides: SweepPoint): Promise<SimResult> {
  const params = { ...getDefaultParams(parasiticVerticalTemplate), ...paramOverrides };
  const wires = parasiticVerticalTemplate.generateGeometry(params);
  const excitation = parasiticVerticalTemplate.generateExcitation(params, wires);
  const freq = params.frequency;

  const body = {
    wires: wires.map(wireToApi),
    excitations: [{
      wire_tag: excitation.wire_tag,
      segment: excitation.segment,
      voltage_real: excitation.voltage_real,
      voltage_imag: excitation.voltage_imag,
    }],
    ground: { ground_type: "average" },
    frequency: { start_mhz: freq, stop_mhz: freq, steps: 1 },
    pattern: {
      theta_start: -90, theta_stop: 90, theta_step: PATTERN_STEP,
      phi_start: 0, phi_stop: 360 - PATTERN_STEP, phi_step: PATTERN_STEP,
    },
  };

  const resp = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
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

function range(start: number, stop: number, step: number): number[] {
  const out: number[] = [];
  for (let v = start; v <= stop + 1e-9; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}

async function runGrid(
  gridParams: { key: string; values: number[] }[],
  fixedOverrides: SweepPoint,
  outPath: string,
  concurrency = 6
) {
  // Cartesian product of grid params
  let combos: SweepPoint[] = [{}];
  for (const { key, values } of gridParams) {
    const next: SweepPoint[] = [];
    for (const combo of combos) {
      for (const v of values) {
        next.push({ ...combo, [key]: v });
      }
    }
    combos = next;
  }

  const gridKeys = gridParams.map((g) => g.key);
  const resultKeys: (keyof SimResult)[] = [
    "gain_max_dbi", "gain_max_theta", "front_to_back_db",
    "swr_50", "impedance_real", "impedance_imag",
  ];
  const header = [...gridKeys, ...resultKeys, "warnings"].join(",");
  const rows: string[] = [header];

  const fs = await import("fs");
  console.log(`Running ${combos.length} combinations (concurrency=${concurrency})...`);

  let completed = 0;
  const results: (string | null)[] = new Array(combos.length).fill(null);

  async function worker(startIdx: number) {
    for (let i = startIdx; i < combos.length; i += concurrency) {
      const combo = combos[i]!;
      const overrides = { ...fixedOverrides, ...combo };
      try {
        const r = await simulateOnePoint(overrides);
        const row = [
          ...gridKeys.map((k) => combo[k]),
          ...resultKeys.map((k) => r[k]),
          `"${r.warnings.join(";")}"`,
        ].join(",");
        results[i] = row;
      } catch (e) {
        results[i] = [...gridKeys.map((k) => combo[k]), "ERROR", "", "", "", "", "", `"${String(e).slice(0,200)}"`].join(",");
      }
      completed++;
      if (completed % 10 === 0 || completed === combos.length) {
        console.log(`  ${completed}/${combos.length}`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, (_, i) => worker(i)));
  rows.push(...(results.filter((r): r is string => r !== null)));
  fs.writeFileSync(outPath, rows.join("\n") + "\n");
  console.log(`Wrote ${combos.length} rows to ${outPath}`);
}

async function main() {
  const outPath = process.argv[2] ?? "./sweep_results.csv";

  // Stage 1: spacing (as fraction of lambda) x detune (%), counterpoises held at
  // template defaults (driven bearing 180/span90, parasitic bearing0/span90).
  const wavelengthAt14175 = 300.0 / 14.175;

  const spacingFracs = range(0.10, 0.35, 0.025); // 11 points
  const detunes = range(-15, 15, 2.5); // 13 points

  const gridParams = [
    { key: "parasitic_spacing", values: spacingFracs.map((f) => Math.round(f * wavelengthAt14175 * 1000) / 1000) },
    { key: "parasitic_detune", values: detunes },
  ];

  await runGrid(gridParams, {}, outPath, 6);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
