"""
Generates summary figures for the driven-passive-vert parameter sweep.

Requires matplotlib (not a project dependency -- run this with a throwaway
venv: `python3 -m venv /tmp/plotenv && /tmp/plotenv/bin/pip install matplotlib
numpy && /tmp/plotenv/bin/python3 make_figures.py`).
"""

import csv
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
FIGS = os.path.join(HERE, "figures")


def load(fname):
    with open(os.path.join(DATA, fname)) as f:
        rows = list(csv.DictReader(f))
    for r in rows:
        for k, v in list(r.items()):
            if k == "warnings":
                continue
            try:
                r[k] = float(v) if v != "" and v != "ERROR" else None
            except ValueError:
                pass
    return [r for r in rows if r.get("front_to_back_db") is not None]


WAVELENGTH_20M = 300.0 / 14.175


# ---------------------------------------------------------------------------
# Figure 1: Stage 1 heatmap -- spacing x detune, F/B and gain side by side
# ---------------------------------------------------------------------------
def fig1_stage1_heatmaps():
    rows = load("stage1_spacing_detune.csv")
    spacings = sorted(set(round(r["parasitic_spacing"] / WAVELENGTH_20M, 3) for r in rows))
    detunes = sorted(set(r["parasitic_detune"] for r in rows))

    def grid(metric):
        g = np.full((len(spacings), len(detunes)), np.nan)
        for r in rows:
            si = spacings.index(round(r["parasitic_spacing"] / WAVELENGTH_20M, 3))
            di = detunes.index(r["parasitic_detune"])
            g[si, di] = r[metric]
        return g

    fb_grid = grid("front_to_back_db")
    gain_grid = grid("gain_max_dbi")

    fig, axes = plt.subplots(1, 2, figsize=(14, 6))
    for ax, g, title, cmap in [
        (axes[0], fb_grid, "Front-to-Back Ratio (dB)", "viridis"),
        (axes[1], gain_grid, "Max Gain (dBi)", "plasma"),
    ]:
        im = ax.imshow(g, aspect="auto", origin="lower", cmap=cmap,
                        extent=[min(detunes), max(detunes), min(spacings), max(spacings)])
        ax.set_xlabel("Parasitic Detune (%)")
        ax.set_ylabel("Parasitic Spacing (λ)")
        ax.set_title(title)
        fig.colorbar(im, ax=ax)
    fig.suptitle("Stage 1: Spacing × Detune Sweep (symmetric 90°/90° counterpoise baseline)", fontsize=13)
    fig.tight_layout()
    fig.savefig(os.path.join(FIGS, "stage1_spacing_detune_heatmap.png"), dpi=140)
    plt.close(fig)


# ---------------------------------------------------------------------------
# Figure 2: Stage 2 -- driven vs parasitic vs coordinated span sweep
# ---------------------------------------------------------------------------
def fig2_stage2_regimes():
    rows = load("stage2_span_sensitivity.csv")
    regimes = ["driven_sweep", "parasitic_sweep", "coordinated_sweep"]
    labels = {
        "driven_sweep": "Driven span varies (parasitic fixed 180°)",
        "parasitic_sweep": "Parasitic span varies (driven fixed 90°)",
        "coordinated_sweep": "Both spans equal (coordinated)",
    }
    spacings = sorted(set(r["spacing_frac"] for r in rows))

    fig, axes = plt.subplots(2, len(spacings), figsize=(15, 8), sharex=True)
    for col, sf in enumerate(spacings):
        for regime in regimes:
            sub = sorted(
                [r for r in rows if r["regime"] == regime and r["spacing_frac"] == sf],
                key=lambda r: r["driven_radial_span"] if regime != "parasitic_sweep" else r["parasitic_radial_span"],
            )
            xvals = [r["driven_radial_span"] if regime != "parasitic_sweep" else r["parasitic_radial_span"] for r in sub]
            axes[0, col].plot(xvals, [r["gain_max_dbi"] for r in sub], marker="o", label=labels[regime])
            axes[1, col].plot(xvals, [r["front_to_back_db"] for r in sub], marker="o", label=labels[regime])
        axes[0, col].set_title(f"spacing = {sf:.3f}λ")
        axes[1, col].set_xlabel("Varying span (deg)")
    axes[0, 0].set_ylabel("Max Gain (dBi)")
    axes[1, 0].set_ylabel("Front-to-Back (dB)")
    axes[0, 0].legend(fontsize=8, loc="lower right")
    fig.suptitle("Stage 2: Driven vs. Parasitic vs. Coordinated Radial Span Sensitivity", fontsize=13)
    fig.tight_layout()
    fig.savefig(os.path.join(FIGS, "stage2_span_sensitivity.png"), dpi=140)
    plt.close(fig)


# ---------------------------------------------------------------------------
# Figure 3: Stage 3 -- detune refinement curves at best driven spans, plus
# a gain-vs-F/B Pareto scatter across the whole Stage 3 dataset.
# ---------------------------------------------------------------------------
def fig3_stage3_refinement():
    rows = load("stage3_detune_refinement.csv")

    fig, axes = plt.subplots(1, 2, figsize=(14, 6))

    # Left: F/B vs detune, several driven_span curves, at spacing=0.150L
    ax = axes[0]
    spans_to_plot = [20, 30, 40, 60, 70]
    sub_all = [r for r in rows if r["spacing_frac"] == 0.150]
    for span in spans_to_plot:
        sub = sorted([r for r in sub_all if r["driven_radial_span"] == span], key=lambda r: r["parasitic_detune"])
        ax.plot([r["parasitic_detune"] for r in sub], [r["front_to_back_db"] for r in sub],
                marker=".", label=f"driven span={span:.0f}°")
    ax.set_xlabel("Parasitic Detune (%)")
    ax.set_ylabel("Front-to-Back (dB)")
    ax.set_title("F/B vs. Detune at spacing=0.150λ")
    ax.legend(fontsize=8)
    ax.axvspan(5, 7, alpha=0.1, color="green")

    # Right: gain vs F/B scatter (Pareto view), colored by spacing
    ax = axes[1]
    spacings = sorted(set(r["spacing_frac"] for r in rows))
    cmap = plt.get_cmap("cool")
    for i, sf in enumerate(spacings):
        sub = [r for r in rows if r["spacing_frac"] == sf]
        ax.scatter([r["gain_max_dbi"] for r in sub], [r["front_to_back_db"] for r in sub],
                   s=14, alpha=0.6, color=cmap(i / max(1, len(spacings) - 1)), label=f"{sf:.3f}λ")
    ax.set_xlabel("Max Gain (dBi)")
    ax.set_ylabel("Front-to-Back (dB)")
    ax.set_title("Gain vs. F/B trade-off across Stage 3 (378 points)")
    ax.legend(title="spacing", fontsize=8)

    fig.suptitle("Stage 3: Detune Refinement (parasitic span fixed at 180°)", fontsize=13)
    fig.tight_layout()
    fig.savefig(os.path.join(FIGS, "stage3_detune_refinement.png"), dpi=140)
    plt.close(fig)


# ---------------------------------------------------------------------------
# Figure 4: Frequency robustness of the top candidate (hand-entered from the
# stress-test performed in-session -- not re-derived from a CSV since it was
# a targeted one-off check, not part of the grid sweeps).
# ---------------------------------------------------------------------------
def fig4_frequency_robustness():
    freqs = [13.900, 14.000, 14.075, 14.125, 14.150, 14.175, 14.200, 14.225, 14.275, 14.350, 14.450]
    fb = [10.42, 14.53, 18.74, 22.31, 24.25, 25.94, 26.75, 26.29, 23.54, 19.84, 16.74]
    gain = [2.09, 2.70, 2.99, 3.10, 3.14, 3.17, 3.19, 3.20, 3.20, 3.16, 3.07]
    swr = [1.4052, 1.2473, 1.2843, 1.3579, 1.4015, 1.4477, 1.4957, 1.5449, 1.6459, 1.8026, 2.0220]

    fig, ax1 = plt.subplots(figsize=(9, 6))
    ax1.plot(freqs, fb, "o-", color="tab:blue", label="Front-to-Back (dB)")
    ax1.plot(freqs, gain, "s-", color="tab:orange", label="Max Gain (dBi)")
    ax1.set_xlabel("Frequency (MHz)")
    ax1.set_ylabel("dB / dBi")
    ax1.axvline(14.175, color="gray", linestyle="--", alpha=0.5, label="Design center")
    ax1.legend(loc="upper left", fontsize=9)

    ax2 = ax1.twinx()
    ax2.plot(freqs, swr, "^-", color="tab:red", alpha=0.6, label="SWR (50Ω)")
    ax2.axhline(1.5, color="tab:red", linestyle=":", alpha=0.4)
    ax2.set_ylabel("SWR", color="tab:red")
    ax2.legend(loc="upper right", fontsize=9)

    ax1.set_title("Top Stage 3 candidate: spacing=0.150λ, driven_span=20°, parasitic_span=180°, detune=+6%\n"
                   "Frequency robustness check -- smooth curve confirms this is a real resonance, not a grid artifact")
    fig.tight_layout()
    fig.savefig(os.path.join(FIGS, "stage3_top_candidate_frequency_robustness.png"), dpi=140)
    plt.close(fig)


if __name__ == "__main__":
    os.makedirs(FIGS, exist_ok=True)
    fig1_stage1_heatmaps()
    fig2_stage2_regimes()
    fig3_stage3_refinement()
    fig4_frequency_robustness()
    print("Wrote figures to", FIGS)
