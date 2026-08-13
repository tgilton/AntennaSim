/**
 * Feed-chain editor — models the real signal path (window line, balun,
 * coax runs) between the antenna's NEC2 feedpoint and wherever a scan
 * was actually taken, as a cascade of transmission-line stages. This is
 * an alternative to the simple ideal-ratio Matching selector above it —
 * enabling it overrides Matching for the SWR/Impedance/Smith charts.
 */

import { useCallback } from "react";
import { NumberInput } from "../ui/NumberInput";
import { useFeedChainStore } from "../../stores/feedChainStore";
import { CABLE_PRESETS, tapOptions, enabledStages } from "../../utils/transmissionLine";
import type { FeedChainStage } from "../../utils/transmissionLine";

function StageRow({
  stage,
  onUpdate,
}: {
  stage: FeedChainStage;
  onUpdate: (patch: Partial<FeedChainStage>) => void;
}) {
  const handlePresetChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const key = e.target.value;
      const preset = CABLE_PRESETS[key];
      if (!preset) return;
      onUpdate({
        cablePreset: key,
        z0: preset.z0,
        velocityFactor: preset.velocityFactor,
        lossDb100ftAt30Mhz: preset.lossDb100ftAt30Mhz,
      });
    },
    [onUpdate]
  );

  const isCustom = stage.cablePreset === "custom";

  return (
    <div className="space-y-1.5 py-1.5 border-t border-border/50 first:border-t-0 first:pt-0">
      <label className="flex items-center gap-1.5 cursor-pointer">
        <input
          type="checkbox"
          checked={stage.enabled}
          onChange={(e) => onUpdate({ enabled: e.target.checked })}
          className="accent-accent"
        />
        <span className="text-xs text-text-primary font-medium">{stage.label}</span>
      </label>

      {stage.enabled && stage.type === "line" && (
        <div className="pl-5 space-y-1.5">
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-text-secondary w-10 shrink-0">Length:</label>
            <NumberInput
              value={stage.lengthFt ?? 0}
              onChange={(v) => onUpdate({ lengthFt: v })}
              min={0}
              max={500}
              decimals={1}
              unit="ft"
              size="sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-text-secondary w-10 shrink-0">Cable:</label>
            <select
              value={stage.cablePreset ?? "custom"}
              onChange={handlePresetChange}
              className="flex-1 bg-background text-text-primary text-xs px-1.5 py-1 rounded border border-border outline-none"
            >
              {Object.entries(CABLE_PRESETS).map(([key, preset]) => (
                <option key={key} value={key}>
                  {preset.label}
                </option>
              ))}
            </select>
          </div>
          {isCustom && (
            <div className="grid grid-cols-3 gap-1.5">
              <NumberInput
                value={stage.z0 ?? 50}
                onChange={(v) => onUpdate({ z0: v })}
                min={1}
                max={1000}
                decimals={0}
                unit="Ω"
                size="xs"
                label="Z0"
              />
              <NumberInput
                value={stage.velocityFactor ?? 0.85}
                onChange={(v) => onUpdate({ velocityFactor: v })}
                min={0.1}
                max={1}
                decimals={2}
                size="xs"
                label="VF"
              />
              <NumberInput
                value={stage.lossDb100ftAt30Mhz ?? 1}
                onChange={(v) => onUpdate({ lossDb100ftAt30Mhz: v })}
                min={0}
                max={20}
                decimals={1}
                unit="dB/100ft"
                size="xs"
                label="Loss@30M"
              />
            </div>
          )}
        </div>
      )}

      {stage.enabled && stage.type === "balun" && (
        <div className="pl-5 flex items-center gap-2">
          <label className="text-[11px] text-text-secondary w-10 shrink-0">Ratio:</label>
          <NumberInput
            value={stage.ratio ?? 1}
            onChange={(v) => onUpdate({ ratio: v })}
            min={0.1}
            max={100}
            decimals={1}
            unit=": 1 (ideal)"
            size="sm"
          />
        </div>
      )}
    </div>
  );
}

export function FeedChainEditor() {
  const enabled = useFeedChainStore((s) => s.enabled);
  const setEnabled = useFeedChainStore((s) => s.setEnabled);
  const stages = useFeedChainStore((s) => s.stages);
  const updateStage = useFeedChainStore((s) => s.updateStage);
  const tapStageId = useFeedChainStore((s) => s.tapStageId);
  const setTapStageId = useFeedChainStore((s) => s.setTapStageId);
  const resetToDefaults = useFeedChainStore((s) => s.resetToDefaults);

  const options = tapOptions(stages);
  const activeStageCount = enabledStages(stages).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wider">
          Feed Chain
        </h3>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="accent-accent"
          />
          <span className="text-[10px] text-text-secondary">
            {enabled ? "On" : "Off"}
          </span>
        </label>
      </div>

      {!enabled && (
        <p className="text-[11px] text-text-secondary px-1 leading-tight">
          Models the real window line + balun + coax runs as a cascade instead of
          Matching's single ideal ratio. Off = charts use Matching above.
        </p>
      )}

      {enabled && (
        <div className="px-1 space-y-2">
          <div className="space-y-0">
            {stages.map((stage) => (
              <StageRow
                key={stage.id}
                stage={stage}
                onUpdate={(patch) => updateStage(stage.id, patch)}
              />
            ))}
          </div>

          <div className="flex items-center gap-2 pt-1 border-t border-border/50">
            <label className="text-[11px] text-text-secondary w-10 shrink-0">
              Show at:
            </label>
            <select
              value={tapStageId ?? ""}
              onChange={(e) => setTapStageId(e.target.value === "" ? null : e.target.value)}
              className="flex-1 bg-background text-text-primary text-xs px-1.5 py-1 rounded border border-border outline-none"
            >
              {options.map((opt) => (
                <option key={opt.id ?? ""} value={opt.id ?? ""}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-[10px] text-text-secondary">
              {activeStageCount} stage{activeStageCount === 1 ? "" : "s"} enabled
            </p>
            <button
              onClick={resetToDefaults}
              className="text-[10px] text-text-secondary hover:text-accent transition-colors"
            >
              Reset to defaults
            </button>
          </div>

          <p className="text-[10px] text-text-secondary leading-tight">
            Cable loss/VF are approximate published reference values, not your exact
            batch — use "Custom" to enter real datasheet numbers. The choke and
            polyphaser aren't modeled (negligible differential-mode effect at HF).
          </p>
        </div>
      )}
    </div>
  );
}
