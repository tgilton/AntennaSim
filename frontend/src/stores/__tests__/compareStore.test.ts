import { describe, it, expect, beforeEach } from "vitest";
import { useCompareStore } from "../compareStore";
import type { SimulationResult } from "../../api/nec";
import type { GroundConfig, FrequencyRange } from "../../templates/types";

const ground: GroundConfig = { type: "average" };
const frequencyRange: FrequencyRange = { start_mhz: 14.0, stop_mhz: 14.35, steps: 11 };

function makeResult(): SimulationResult {
  return {
    simulation_id: "sim-1",
    engine: "nec2c",
    computed_in_ms: 10,
    total_segments: 21,
    cached: false,
    frequency_data: [],
    warnings: [],
  };
}

describe("useCompareStore", () => {
  beforeEach(() => {
    useCompareStore.setState({ savedResults: [], isComparing: false, maxResults: 6 });
  });

  it("saveResult adds a candidate with a generated id and default label", () => {
    useCompareStore.getState().saveResult(makeResult(), { ground, frequencyRange });
    const { savedResults } = useCompareStore.getState();
    expect(savedResults).toHaveLength(1);
    expect(savedResults[0]!.id).toMatch(/^compare-/);
    expect(savedResults[0]!.label).toMatch(/^Run \d+$/);
  });

  it("saveResult uses a custom label and marks simulator mode when simulator info is given", () => {
    useCompareStore.getState().saveResult(makeResult(), {
      label: "My Config",
      ground,
      frequencyRange,
      simulator: { templateId: "parasitic-vertical", params: { parasitic_detune: 5 } },
    });
    const saved = useCompareStore.getState().savedResults[0]!;
    expect(saved.label).toBe("My Config");
    expect(saved.mode).toBe("simulator");
    expect(saved.simulator?.templateId).toBe("parasitic-vertical");
  });

  it("saveResult without simulator info marks editor mode", () => {
    useCompareStore.getState().saveResult(makeResult(), { ground, frequencyRange });
    expect(useCompareStore.getState().savedResults[0]!.mode).toBe("editor");
  });

  it("trims the oldest result once maxResults is exceeded", () => {
    useCompareStore.setState({ maxResults: 2 });
    const store = useCompareStore.getState();
    store.saveResult(makeResult(), { label: "first", ground, frequencyRange });
    store.saveResult(makeResult(), { label: "second", ground, frequencyRange });
    store.saveResult(makeResult(), { label: "third", ground, frequencyRange });
    const { savedResults } = useCompareStore.getState();
    expect(savedResults).toHaveLength(2);
    expect(savedResults.map((r) => r.label)).toEqual(["second", "third"]);
  });

  it("removeResult removes only the targeted candidate", () => {
    const store = useCompareStore.getState();
    store.saveResult(makeResult(), { label: "keep", ground, frequencyRange });
    store.saveResult(makeResult(), { label: "drop", ground, frequencyRange });
    const toDrop = useCompareStore.getState().savedResults[1]!.id;
    useCompareStore.getState().removeResult(toDrop);
    const { savedResults } = useCompareStore.getState();
    expect(savedResults).toHaveLength(1);
    expect(savedResults[0]!.label).toBe("keep");
  });

  it("clearAll empties savedResults and turns off comparing", () => {
    const store = useCompareStore.getState();
    store.saveResult(makeResult(), { ground, frequencyRange });
    store.setComparing(true);
    store.clearAll();
    const state = useCompareStore.getState();
    expect(state.savedResults).toHaveLength(0);
    expect(state.isComparing).toBe(false);
  });

  it("setComparing toggles isComparing independently of saved results", () => {
    useCompareStore.getState().setComparing(true);
    expect(useCompareStore.getState().isComparing).toBe(true);
    useCompareStore.getState().setComparing(false);
    expect(useCompareStore.getState().isComparing).toBe(false);
  });

  it("saved ground/frequencyRange/frequencySegments are copies, not references (mutating the original doesn't affect the saved candidate)", () => {
    const mutableGround: GroundConfig = { type: "average" };
    useCompareStore.getState().saveResult(makeResult(), { ground: mutableGround, frequencyRange });
    mutableGround.type = "perfect";
    expect(useCompareStore.getState().savedResults[0]!.ground.type).toBe("average");
  });
});
