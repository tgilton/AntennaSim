/**
 * Feed-chain store — the real signal path from the antenna feedpoint to
 * wherever a RigExpert scan was actually taken, modeled as a cascade of
 * transmission-line and balun stages (see utils/transmissionLine.ts).
 *
 * Defaults are pre-populated from the Greyline DXF's actual hardware:
 * 3.8 ft window line -> 4:1 balun -> [optional 50 ft coax loop] ->
 * 13 ft LMR-400 -> 8 ft LMR-240 to the radio. The 1:1 choke and the
 * polyphaser are omitted as stages — the choke has no differential-mode
 * effect (matches the template's own documented assumption) and the
 * polyphaser's insertion loss is negligible at HF.
 *
 * The selected tap point is tracked by stage id (tapStageId), not a
 * numeric position — a positional index would silently point at a
 * different physical location whenever an earlier stage gets toggled.
 */

import { create } from "zustand";
import type { FeedChainStage } from "../utils/transmissionLine";
import { enabledStages } from "../utils/transmissionLine";

function defaultStages(): FeedChainStage[] {
  return [
    {
      id: "window-line",
      label: "Window Line",
      type: "line",
      enabled: true,
      cablePreset: "ladder450",
      lengthFt: 3.8,
      z0: 450,
      velocityFactor: 0.95,
      lossDb100ftAt30Mhz: 0.1,
    },
    {
      id: "balun",
      label: "4:1 Balun",
      type: "balun",
      enabled: true,
      ratio: 4,
    },
    {
      id: "coax-loop",
      label: "50 ft Coax Loop",
      type: "line",
      enabled: false,
      cablePreset: "lmr400",
      lengthFt: 50,
      z0: 50,
      velocityFactor: 0.85,
      lossDb100ftAt30Mhz: 1.4,
    },
    {
      id: "lmr400",
      label: "LMR-400 (13 ft)",
      type: "line",
      enabled: true,
      cablePreset: "lmr400",
      lengthFt: 13,
      z0: 50,
      velocityFactor: 0.85,
      lossDb100ftAt30Mhz: 1.4,
    },
    {
      id: "lmr240",
      label: "LMR-240 (8 ft)",
      type: "line",
      enabled: true,
      cablePreset: "lmr240",
      lengthFt: 8,
      z0: 50,
      velocityFactor: 0.80,
      lossDb100ftAt30Mhz: 3.9,
    },
  ];
}

/** Last enabled stage's id, or null if none are enabled (raw feedpoint). */
function lastEnabledStageId(stages: FeedChainStage[]): string | null {
  const en = enabledStages(stages);
  return en.length > 0 ? en[en.length - 1]!.id : null;
}

interface FeedChainState {
  enabled: boolean;
  stages: FeedChainStage[];
  /** Stage id to display impedance after; null = raw antenna feedpoint. */
  tapStageId: string | null;

  setEnabled: (enabled: boolean) => void;
  updateStage: (id: string, patch: Partial<FeedChainStage>) => void;
  setTapStageId: (id: string | null) => void;
  resetToDefaults: () => void;
}

export const useFeedChainStore = create<FeedChainState>((set) => ({
  enabled: false,
  stages: defaultStages(),
  // Default tap = end of chain (all enabled stages applied — "at the radio").
  tapStageId: lastEnabledStageId(defaultStages()),

  setEnabled: (enabled) => set({ enabled }),

  updateStage: (id, patch) =>
    set((s) => {
      const stages = s.stages.map((stage) => (stage.id === id ? { ...stage, ...patch } : stage));
      // If the currently-displayed tap was tracking "the end of the chain"
      // and a stage got enabled/disabled, keep tracking the new end.
      // Otherwise, if the tap's own stage got disabled, fall back to the
      // new end of chain too (its old position no longer exists).
      const wasTrackingEnd = s.tapStageId === lastEnabledStageId(s.stages);
      const tapStillValid = s.tapStageId === null || enabledStages(stages).some((st) => st.id === s.tapStageId);
      const tapStageId = wasTrackingEnd || !tapStillValid ? lastEnabledStageId(stages) : s.tapStageId;
      return { stages, tapStageId };
    }),

  setTapStageId: (id) => set({ tapStageId: id }),

  resetToDefaults: () => {
    const stages = defaultStages();
    set({ stages, tapStageId: lastEnabledStageId(stages) });
  },
}));
