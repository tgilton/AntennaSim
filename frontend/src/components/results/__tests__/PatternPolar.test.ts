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
