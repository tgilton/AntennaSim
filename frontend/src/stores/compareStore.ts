/**
 * Compare store — stores multiple simulation results for overlay comparison.
 *
 * Users can save the current simulation result, then run another simulation
 * and overlay the two results in charts and 3D pattern.
 */

import { create } from "zustand";
import type { SimulationResult } from "../api/nec";
import type { GroundConfig, FrequencyRange, FrequencySegment } from "../templates/types";

export type CandidateMode = "simulator" | "editor";

export interface SavedCandidate {
  id: string;
  label: string;
  timestamp: number;
  mode: CandidateMode;
  result: SimulationResult;
  color: string;
  ground: GroundConfig;
  frequencyRange: FrequencyRange;
  frequencySegments: FrequencySegment[];
  simulator?: {
    templateId: string;
    params: Record<string, number>;
  };
}

const COMPARE_COLORS = [
  "#3B82F6", // blue
  "#EF4444", // red
  "#10B981", // green
  "#F59E0B", // amber
  "#8B5CF6", // purple
  "#EC4899", // pink
];

interface CompareState {
  /** Saved simulation results for comparison */
  savedResults: SavedCandidate[];
  /** Whether compare mode is active */
  isComparing: boolean;
  /** Maximum saved results */
  maxResults: number;

  // Actions
  /** Save current result for comparison */
  saveResult: (
    result: SimulationResult,
    options: {
      label?: string;
      ground: GroundConfig;
      frequencyRange: FrequencyRange;
      frequencySegments?: FrequencySegment[];
      simulator?: {
        templateId: string;
        params: Record<string, number>;
      };
    }
  ) => void;
  /** Remove a saved result */
  removeResult: (id: string) => void;
  /** Clear all saved results */
  clearAll: () => void;
  /** Toggle compare mode */
  setComparing: (comparing: boolean) => void;
}

let nextId = 1;

export const useCompareStore = create<CompareState>((set) => ({
  savedResults: [],
  isComparing: false,
  maxResults: 6,

  saveResult: (result, options) => {
    const id = `compare-${nextId++}`;
    set((s) => {
      const trimmed =
        s.savedResults.length >= s.maxResults
          ? s.savedResults.slice(1)
          : s.savedResults;
      const colorIdx = trimmed.length % COMPARE_COLORS.length;

      const saved: SavedCandidate = {
        id,
        label: options.label ?? `Run ${nextId - 1}`,
        timestamp: Date.now(),
        mode: options.simulator ? "simulator" : "editor",
        result,
        color: COMPARE_COLORS[colorIdx]!,
        ground: { ...options.ground },
        frequencyRange: { ...options.frequencyRange },
        frequencySegments: options.frequencySegments
          ? options.frequencySegments.map((seg) => ({ ...seg }))
          : [],
        simulator: options.simulator
          ? {
              templateId: options.simulator.templateId,
              params: { ...options.simulator.params },
            }
          : undefined,
      };

      return { savedResults: [...trimmed, saved] };
    });
  },

  removeResult: (id) => {
    set((s) => ({
      savedResults: s.savedResults.filter((r) => r.id !== id),
    }));
  },

  clearAll: () => {
    set({ savedResults: [], isComparing: false });
  },

  setComparing: (comparing) => {
    set({ isComparing: comparing });
  },
}));
