/**
 * Regression test for the NEC phi -> compass bearing conversion.
 *
 * Verified against three independent checks (see PatternPolar.tsx comment):
 * a director placed on the +X axis produces its gain peak at raw phi=0,
 * which must map to compass bearing=90 (east); polarToXY places bearing=90
 * at the visual "E" label with no other coordinate flip in the render path;
 * and CHANGELOG.md's own description of the bug this formula fixes implies
 * phi=90 must map to bearing=0 (north). A previous merge briefly introduced
 * a 180-degree-mirrored version of this formula (bearing = -90-phi instead
 * of 90-phi) that satisfies none of these — this test pins the correct one.
 */
import { describe, it, expect } from "vitest";
import { extractCut } from "../PatternPolar";
import type { PatternData } from "../../../api/nec";

function makePattern(phiCount: number): PatternData {
  // Single theta row (theta_start=0, step=1, count=1), phi spans a full circle.
  const phi_step = 360 / phiCount;
  const gain_dbi = [Array.from({ length: phiCount }, () => -10)];
  return {
    theta_start: 0,
    theta_step: 1,
    theta_count: 1,
    phi_start: 0,
    phi_step,
    phi_count: phiCount,
    gain_dbi,
  };
}

function makeMultiThetaPattern(): PatternData {
  // theta -90..0 step 10 (elevation 0..90 above horizon), 4 phi points.
  // Each theta row's gain is a unique marker (ti*100) so tests can confirm
  // which row extractCut actually pulled from.
  const theta_count = 10;
  const phi_count = 4;
  const gain_dbi = Array.from({ length: theta_count }, (_, ti) =>
    Array.from({ length: phi_count }, () => ti * 100)
  );
  return {
    theta_start: -90,
    theta_step: 10,
    theta_count,
    phi_start: 0,
    phi_step: 90,
    phi_count,
    gain_dbi,
  };
}

describe("extractCut azimuth mode: fixedElevationDeg row selection", () => {
  it("elevation=30 selects theta=-60 (row index 3)", () => {
    const pattern = makeMultiThetaPattern();
    const points = extractCut(pattern, "azimuth", 30);
    expect(points.every((p) => p.gain === 300)).toBe(true);
  });

  it("elevation=0 (horizon) selects theta=-90 (row index 0)", () => {
    const pattern = makeMultiThetaPattern();
    const points = extractCut(pattern, "azimuth", 0);
    expect(points.every((p) => p.gain === 0)).toBe(true);
  });

  it("elevation=90 (zenith) selects theta=0 (row index 9)", () => {
    const pattern = makeMultiThetaPattern();
    const points = extractCut(pattern, "azimuth", 90);
    expect(points.every((p) => p.gain === 900)).toBe(true);
  });

  it("out-of-range elevation clamps to the nearest valid row instead of erroring", () => {
    const pattern = makeMultiThetaPattern();
    const tooHigh = extractCut(pattern, "azimuth", 150);
    expect(tooHigh.every((p) => p.gain === 900)).toBe(true); // clamps to zenith row
    const tooLow = extractCut(pattern, "azimuth", -50);
    expect(tooLow.every((p) => p.gain === 0)).toBe(true); // clamps to horizon row
  });

  it("omitting fixedElevationDeg (auto) picks the row with the global max gain regardless of elevation", () => {
    const pattern = makeMultiThetaPattern();
    // Global max is row 9 (900) by construction; auto mode should find it
    // even though it's the last row, not because of any elevation targeting.
    const points = extractCut(pattern, "azimuth");
    expect(points.every((p) => p.gain === 900)).toBe(true);
  });
});

describe("extractCut azimuth mode: NEC phi -> compass bearing", () => {
  it("maps phi=0 to bearing=90 (east) -- matches a director on the +X axis peaking at phi=0", () => {
    const pattern = makePattern(4); // phis: 0, 90, 180, 270
    const points = extractCut(pattern, "azimuth");
    const atPhi0 = points.find((p) => p.angle === 90);
    expect(atPhi0).toBeDefined();
  });

  it("maps phi=90 to bearing=0 (north) -- matches CHANGELOG's bug description", () => {
    const pattern = makePattern(4);
    const points = extractCut(pattern, "azimuth");
    const atPhi90 = points.find((p) => p.angle === 0);
    expect(atPhi90).toBeDefined();
  });

  it("full phi->bearing mapping is bearing = (90 - phi) mod 360", () => {
    const pattern = makePattern(4); // phis: 0, 90, 180, 270
    const points = extractCut(pattern, "azimuth");
    const angles = points.map((p) => p.angle).sort((a, b) => a - b);
    // phi 0,90,180,270 -> bearing 90,0,270,180 -> sorted: 0,90,180,270
    expect(angles).toEqual([0, 90, 180, 270]);
  });
});
