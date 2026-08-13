import { describe, it, expect } from "vitest";
import { applyFeedChain, resolveMatch, tapLabels, tapOptions, tapIndexForStageId, enabledStages } from "../transmissionLine";
import type { FeedChainStage, FeedChainConfig } from "../transmissionLine";
import { DEFAULT_MATCHING } from "../units";

const C_LIGHT = 299792458;
const FT_TO_M = 0.3048;

/** Physical length (ft) of a quarter-wave lossless line at freqMhz, velocity factor vf. */
function quarterWaveFt(freqMhz: number, vf: number): number {
  const wavelengthM = (vf * C_LIGHT) / (freqMhz * 1e6);
  return wavelengthM / 4 / FT_TO_M;
}

function lineStage(overrides: Partial<FeedChainStage> = {}): FeedChainStage {
  return {
    id: "line",
    label: "Test Line",
    type: "line",
    enabled: true,
    z0: 50,
    velocityFactor: 1, // free-space, for clean closed-form checks
    lengthFt: 0,
    lossDb100ftAt30Mhz: 0, // lossless unless overridden
    ...overrides,
  };
}

describe("transmissionLine — lossless quarter-wave transformer", () => {
  it("transforms Z_L to Z0^2 / Z_L", () => {
    const freqMhz = 30;
    const z0 = 50;
    const zl = 200; // pure real load
    const lengthFt = quarterWaveFt(freqMhz, 1);
    const stage = lineStage({ z0, lengthFt });
    const config: FeedChainConfig = { enabled: true, stages: [stage], tapIndex: 1 };

    const result = applyFeedChain(freqMhz, zl, 0, config);
    expect(result.real).toBeCloseTo((z0 * z0) / zl, 1);
    expect(result.imag).toBeCloseTo(0, 1);
  });
});

describe("transmissionLine — lossless half-wave line", () => {
  it("is an identity transform (Z_in = Z_L)", () => {
    const freqMhz = 30;
    const zl = { r: 123, x: -45 };
    const lengthFt = quarterWaveFt(freqMhz, 1) * 2; // half wave
    const stage = lineStage({ z0: 50, lengthFt });
    const config: FeedChainConfig = { enabled: true, stages: [stage], tapIndex: 1 };

    const result = applyFeedChain(freqMhz, zl.r, zl.x, config);
    expect(result.real).toBeCloseTo(zl.r, 0);
    expect(result.imag).toBeCloseTo(zl.x, 0);
  });
});

describe("transmissionLine — ideal balun", () => {
  it("divides impedance by the ratio (matches applyMatching's ideal-ratio behavior)", () => {
    const balun: FeedChainStage = { id: "b", label: "Balun", type: "balun", enabled: true, ratio: 4 };
    const config: FeedChainConfig = { enabled: true, stages: [balun], tapIndex: 1 };
    const result = applyFeedChain(30, 200, 40, config);
    expect(result.real).toBeCloseTo(50, 6);
    expect(result.imag).toBeCloseTo(10, 6);
  });
});

describe("transmissionLine — disabled stages and zero-length lines are no-ops", () => {
  it("skips disabled stages", () => {
    const stage = lineStage({ lengthFt: 100, enabled: false });
    const config: FeedChainConfig = { enabled: true, stages: [stage], tapIndex: 1 };
    const result = applyFeedChain(30, 77, -12, config);
    expect(result.real).toBeCloseTo(77, 6);
    expect(result.imag).toBeCloseTo(-12, 6);
  });

  it("treats a zero-length line as a pass-through", () => {
    const stage = lineStage({ lengthFt: 0 });
    const config: FeedChainConfig = { enabled: true, stages: [stage], tapIndex: 1 };
    const result = applyFeedChain(30, 77, -12, config);
    expect(result.real).toBeCloseTo(77, 6);
    expect(result.imag).toBeCloseTo(-12, 6);
  });
});

describe("transmissionLine — cascade ordering and tapIndex", () => {
  it("applies only enabled stages, up to tapIndex, in order", () => {
    const windowLine = lineStage({ id: "wl", label: "Window Line", z0: 450, lengthFt: 0 });
    const balun: FeedChainStage = { id: "balun", label: "4:1 Balun", type: "balun", enabled: true, ratio: 4 };
    const disabledLoop = lineStage({ id: "loop", label: "Loop", enabled: false, lengthFt: 50 });
    const coax = lineStage({ id: "coax", label: "Coax", z0: 50, lengthFt: 0 });
    const stages = [windowLine, balun, disabledLoop, coax];

    const labels = tapLabels(stages);
    // disabledLoop is excluded from enabled-stage tap points.
    expect(labels).toEqual([
      "Antenna Feedpoint (raw)",
      "After Window Line",
      "After 4:1 Balun",
      "After Coax",
    ]);
    expect(enabledStages(stages)).toHaveLength(3);

    // tapIndex=2 -> after window line + balun -> 200/4 = 50
    const afterBalun = applyFeedChain(30, 200, 0, { enabled: true, stages, tapIndex: 2 });
    expect(afterBalun.real).toBeCloseTo(50, 4);

    // tapIndex=0 -> raw antenna feedpoint, untouched
    const raw = applyFeedChain(30, 200, 0, { enabled: true, stages, tapIndex: 0 });
    expect(raw.real).toBeCloseTo(200, 6);
  });
});

describe("transmissionLine — tap tracked by stage id, stable across toggles", () => {
  it("tapOptions excludes disabled stages and tapIndexForStageId resolves the right position", () => {
    const windowLine = lineStage({ id: "wl", label: "Window Line", z0: 450, lengthFt: 0 });
    const balun: FeedChainStage = { id: "balun", label: "4:1 Balun", type: "balun", enabled: true, ratio: 4 };
    const loop = lineStage({ id: "loop", label: "Loop", enabled: false, lengthFt: 50 });
    const coax = lineStage({ id: "coax", label: "Coax", z0: 50, lengthFt: 0 });
    const stages = [windowLine, balun, loop, coax];

    expect(tapOptions(stages).map((o) => o.label)).toEqual([
      "Antenna Feedpoint (raw)",
      "After Window Line",
      "After 4:1 Balun",
      "After Coax",
    ]);

    // "coax" is the id-stable end of the chain while loop is disabled.
    expect(tapIndexForStageId(stages, "coax")).toBe(3);
    expect(tapIndexForStageId(stages, "balun")).toBe(2);
    expect(tapIndexForStageId(stages, null)).toBe(0);

    // Enable the loop stage: "balun"'s numeric position doesn't change
    // (it's still stage #2 in the enabled list), proving the id-based
    // lookup stays correct even as the chain grows around it.
    const withLoop = stages.map((s) => (s.id === "loop" ? { ...s, enabled: true } : s));
    expect(tapIndexForStageId(withLoop, "balun")).toBe(2);
    // But "coax" (previously the end of chain, position 3) is now pushed
    // to position 4 by the newly-enabled loop stage before it.
    expect(tapIndexForStageId(withLoop, "coax")).toBe(4);
  });
});

describe("resolveMatch — falls back to simple matching when feed chain is disabled", () => {
  it("uses applyMatching's ideal-ratio behavior when feedChain is undefined", () => {
    const matching = { ...DEFAULT_MATCHING, type: "balun" as const, ratio: 4, feedlineZ0: 50 };
    const result = resolveMatch(14.1, 200, 40, matching);
    expect(result.real).toBeCloseTo(50, 6);
    expect(result.imag).toBeCloseTo(10, 6);
    expect(result.z0).toBe(50);
  });

  it("uses the feed chain when enabled, ignoring matching", () => {
    const balun: FeedChainStage = { id: "b", label: "Balun", type: "balun", enabled: true, ratio: 2 };
    const feedChain: FeedChainConfig = { enabled: true, stages: [balun], tapIndex: 1 };
    const matching = { ...DEFAULT_MATCHING, type: "balun" as const, ratio: 4, feedlineZ0: 50 };
    const result = resolveMatch(14.1, 200, 0, matching, feedChain);
    expect(result.real).toBeCloseTo(100, 6); // /2, not /4
  });
});

describe("transmissionLine — lossy line attenuates magnitude toward Z0", () => {
  it("a long lossy line pulls Z_in toward Z0 regardless of load", () => {
    const stage = lineStage({ z0: 50, lengthFt: 500, lossDb100ftAt30Mhz: 10, velocityFactor: 0.85 });
    const config: FeedChainConfig = { enabled: true, stages: [stage], tapIndex: 1 };
    const result = applyFeedChain(30, 1000, 0, config); // wildly mismatched load
    expect(result.real).toBeCloseTo(50, -1); // within ~tens of ohms of Z0
    expect(Math.abs(result.imag)).toBeLessThan(5);
  });
});
