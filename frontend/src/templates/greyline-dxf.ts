/**
 * Greyline DXF — vertical off-center-fed dipole with a tapered top element.
 *
 * A two-wire dipole standing on end: a short bottom arm and a much longer
 * top arm, fed at the junction between them (same physics as a horizontal
 * OCF/Windom, just rotated 90°). No counterpoise/radial return is required —
 * it's a balanced two-conductor dipole, not a grounded monopole.
 *
 * Real hardware this models:
 *   Bottom element  — 2" aluminum tube, base ~1m above ground.
 *   Top element     — 20 ft of 2" aluminum tube, then an 11.4 ft whip
 *                      tapering continuously from 3/4" down to 1/4" OD.
 *                      The taper is approximated with several stepped-radius
 *                      wire segments (standard practice for tapered
 *                      elements — hollow vs. solid sections make no RF
 *                      difference at HF since skin effect only cares about
 *                      the outer surface, so only OD is modeled).
 *   Feedline        — 6 ft of 450Ω window line → 4:1 Guanella current balun
 *                      → 1:1 common-mode choke → 20 ft LMR240 → radio.
 *                      NOT modeled as NEC2 transmission-line sections; the
 *                      simulation feeds directly at the element junction
 *                      (gives accurate pattern/gain/feedpoint impedance).
 *                      The 4:1 balun step is applied as an ideal ratio via
 *                      the template's `defaultMatching` to estimate SWR at
 *                      the coax. The choke has no differential-mode effect
 *                      on the antenna itself, so it isn't represented.
 *
 * Optional L-wire (counterpoise): attaches at the very bottom of the bottom
 * element — in series with it, not branching off partway up — and runs
 * horizontally at a right angle. Because it shares the bottom element's
 * lower endpoint, current flows straight through the bend: it's an
 * inverted-L extension that adds true electrical length to the short bottom
 * arm, not a parallel stub. Off by default (length = 0).
 *
 * NEC2 coordinates: X=east, Y=north, Z=up.
 */

import type {
  AntennaTemplate,
  WireGeometry,
  Excitation,
  FeedpointData,
  FrequencyRange,
} from "./types";
import type { LumpedLoad } from "../api/nec";
import { autoSegment } from "../engine/segmentation";

// Fixed break point between the top element's tube section and its tapered
// whip, matching the real hardware (20 ft of 2" tube). If top_length is
// adjusted below this, the whip disappears and the top element is all tube.
const TOP_TUBE_LEN_M = 6.096; // 20 ft
const NUM_WHIP_STEPS = 6; // stepped-radius approximation of the continuous taper
const MAX_FREQ_MHZ = 30; // segmentation reference — covers 10m

export const greylineDxfTemplate: AntennaTemplate = {
  id: "greyline-dxf",
  name: "Greyline DXF (Vertical OCF Dipole)",
  nameShort: "Greyline DXF",
  description:
    "Vertical off-center-fed dipole with a tapered whip top element — fed via 450Ω line and a 4:1 balun.",
  longDescription:
    "A vertical off-center-fed dipole: a short bottom arm and a much longer tapered top arm, " +
    "fed at their junction — the same physics as a horizontal OCF/Windom, just standing on end. " +
    "The top element is built from 20 ft of 2\" aluminum tube topped with an 11.4 ft whip that " +
    "tapers continuously from 3/4\" down to 1/4\" OD; the taper is approximated here with several " +
    "stepped-radius wire segments. No ground radial system is needed — it's a balanced two-conductor " +
    "dipole. An optional inverted-L counterpoise wire can extend off the very bottom of the " +
    "bottom element, in series, adding true electrical length to the short arm. Fed with 450Ω " +
    "window line into a 4:1 Guanella current balun and a 1:1 common-mode choke before the coax " +
    "run to the radio.",
  icon: "⌐|",
  category: "vertical",
  difficulty: "advanced",
  bands: ["20m", "17m", "15m", "12m", "10m"],
  defaultGround: { type: "average" },
  defaultMatching: { type: "balun", ratio: 4, feedlineZ0: 50 },
  tips: [
    "Feed is modeled directly at the bottom/top element junction — the real 450Ω line, 4:1 " +
      "balun, choke, and coax run aren't simulated as transmission-line sections.",
    "The 4:1 balun step is applied as an ideal ratio (see Matching) to estimate SWR at the coax; " +
      "the common-mode choke has no differential-mode RF effect, so it doesn't change antenna performance.",
    "Hollow vs. solid whip sections make no RF difference at HF — only outer diameter matters, " +
      "so that's all that's modeled.",
    "The L-wire counterpoise is off by default (length = 0). It attaches at the very bottom of " +
      "the bottom element and bends horizontal — an inverted-L that lengthens the short arm in " +
      "series, not a parallel stub.",
    "This is a balanced dipole, not a grounded monopole — no counterpoise/radials required.",
    "Run the frequency sweep to see actual multiband SWR; exact resonances depend on your build.",
    "Loading Coil (off by default) adds a series inductor on the top element for low-band " +
      "operation the antenna is otherwise far too short for. Loading at the feedpoint gives an " +
      "easier match and wider bandwidth; loading at the tube/whip junction is more efficient but " +
      "sharply narrow-band. A coil sized for one band will badly mismatch — not just detune — " +
      "any other band, so this models one band at a time, not a multiband loading scheme.",
  ],
  relatedTemplates: ["off-center-fed", "vertical", "elevated-quarterwave"],

  parameters: [
    {
      key: "bottom_length",
      label: "Bottom Element Length",
      description: "Length of the short bottom arm (2\" tube). Default = 48 in.",
      unit: "m",
      min: 0.3,
      max: 4,
      step: 0.01,
      defaultValue: 1.219,
      decimals: 3,
    },
    {
      key: "top_length",
      label: "Top Element Length",
      description:
        "Total length of the long top arm: 20 ft of 2\" tube plus a tapered whip making up the " +
        "remainder. Default = 377 in.",
      unit: "m",
      min: 1,
      max: 15,
      step: 0.01,
      defaultValue: 9.576,
      decimals: 3,
    },
    {
      key: "base_height",
      label: "Base Height",
      description: "Height of the bottom element's lower end above ground",
      unit: "m",
      min: 0.1,
      max: 5,
      step: 0.1,
      defaultValue: 1.0,
      decimals: 2,
    },
    {
      key: "tube_diameter",
      label: "Tube Diameter",
      description: "Diameter of the 2\" aluminum tube sections (bottom element and top tube run)",
      unit: "mm",
      min: 10,
      max: 150,
      step: 1,
      defaultValue: 50.8,
      decimals: 1,
    },
    {
      key: "whip_start_diameter",
      label: "Whip Start Diameter",
      description: "Whip OD where it meets the top tube (default 3/4\")",
      unit: "mm",
      min: 5,
      max: 50,
      step: 0.5,
      defaultValue: 19.05,
      decimals: 2,
    },
    {
      key: "whip_end_diameter",
      label: "Whip Tip Diameter",
      description: "Whip OD at the very top (default 1/4\")",
      unit: "mm",
      min: 2,
      max: 30,
      step: 0.5,
      defaultValue: 6.35,
      decimals: 2,
    },
    {
      key: "l_wire_length",
      label: "L-Wire (Counterpoise) Length",
      description:
        "Length of an optional inverted-L wire off the very bottom of the bottom element — " +
        "in series with it, adding true electrical length to the short arm.",
      unit: "m",
      min: 0,
      max: 10,
      step: 0.1,
      defaultValue: 0,
      decimals: 2,
      zeroLabel: "Off (no L-wire)",
    },
    {
      key: "l_wire_azimuth",
      label: "L-Wire Azimuth",
      description: "Compass direction the L-wire points (0°=north, 90°=east)",
      unit: "deg",
      min: 0,
      max: 360,
      step: 5,
      defaultValue: 90,
      decimals: 0,
    },
    {
      key: "loading_coil_position",
      label: "Loading Coil Position",
      description:
        "Series loading coil on the top element, for low-band operation the antenna is " +
        "otherwise far too short for (e.g. 160m/80m). 0 = off. 1 = at the feedpoint " +
        "(bottom of the top element) — easier match, wider bandwidth, lower efficiency. " +
        "2 = at the tube/whip junction (20 ft up) — better efficiency, but a much sharper, " +
        "harder-to-match, narrower-band resonance.",
      unit: "",
      min: 0,
      max: 2,
      step: 1,
      defaultValue: 0,
      decimals: 0,
      zeroLabel: "Off (no loading coil)",
    },
    {
      key: "loading_coil_inductance",
      label: "Loading Coil Inductance",
      description: "Series inductance of the loading coil. Only used when Position is not Off.",
      unit: "µH",
      min: 10,
      max: 600,
      step: 1,
      defaultValue: 230,
      decimals: 0,
    },
    {
      key: "loading_coil_q",
      label: "Loading Coil Q",
      description:
        "Coil quality factor — sets its series loss resistance (R = X_L / Q) at the design " +
        "frequency. Real air-core loading coils are typically Q≈100–300; lower Q means " +
        "more of your transmit power turns into heat in the coil instead of radiating.",
      unit: "",
      min: 20,
      max: 500,
      step: 10,
      defaultValue: 150,
      decimals: 0,
    },
    {
      key: "loading_coil_design_freq_mhz",
      label: "Loading Coil Design Freq",
      description:
        "Frequency the coil's loss resistance (R = X_L / Q) is calculated at — set this to " +
        "whatever band you're loading for (e.g. 1.9 for 160m, 3.75 for 80m). NEC2 loads are " +
        "fixed R/L/C values, not frequency-dependent, so this picks one reference point; the " +
        "coil's true loss actually rises with frequency, so results away from this frequency " +
        "will be somewhat optimistic.",
      unit: "MHz",
      min: 1.5,
      max: 10,
      step: 0.05,
      defaultValue: 1.9,
      decimals: 2,
    },
  ],

  generateGeometry(params: Record<string, number>): WireGeometry[] {
    const bottomLength = params.bottom_length ?? 1.219;
    const topLength = params.top_length ?? 9.576;
    const baseHeight = params.base_height ?? 1.0;
    const tubeRadius = (params.tube_diameter ?? 50.8) / 1000 / 2;
    const whipStartRadius = (params.whip_start_diameter ?? 19.05) / 1000 / 2;
    const whipEndRadius = (params.whip_end_diameter ?? 6.35) / 1000 / 2;
    const lWireLength = params.l_wire_length ?? 0;
    const lWireAzimuthRad = ((params.l_wire_azimuth ?? 90) * Math.PI) / 180;

    const tubeLen = Math.min(topLength, TOP_TUBE_LEN_M);
    const whipLen = Math.max(topLength - TOP_TUBE_LEN_M, 0);

    const wires: WireGeometry[] = [];

    // Tag 1: bottom element
    const junctionZ = baseHeight + bottomLength;
    const bottomSegs = autoSegment(bottomLength, MAX_FREQ_MHZ, 9);
    wires.push({
      tag: 1,
      segments: bottomSegs,
      x1: 0,
      y1: 0,
      z1: baseHeight,
      x2: 0,
      y2: 0,
      z2: junctionZ,
      radius: tubeRadius,
    });

    // Tag 2: top element's tube section
    const tubeTopZ = junctionZ + tubeLen;
    const tubeSegs = autoSegment(tubeLen, MAX_FREQ_MHZ, 9);
    wires.push({
      tag: 2,
      segments: tubeSegs,
      x1: 0,
      y1: 0,
      z1: junctionZ,
      x2: 0,
      y2: 0,
      z2: tubeTopZ,
      radius: tubeRadius,
    });

    // Tags 3..(2+N): whip, approximated as stepped-radius segments over a
    // linear taper from whipStartRadius down to whipEndRadius.
    if (whipLen > 0) {
      const stepLen = whipLen / NUM_WHIP_STEPS;
      const stepSegs = autoSegment(stepLen, MAX_FREQ_MHZ, 3);
      for (let i = 0; i < NUM_WHIP_STEPS; i++) {
        const t0 = i / NUM_WHIP_STEPS;
        const t1 = (i + 1) / NUM_WHIP_STEPS;
        wires.push({
          tag: 3 + i,
          segments: stepSegs,
          x1: 0,
          y1: 0,
          z1: tubeTopZ + i * stepLen,
          x2: 0,
          y2: 0,
          z2: tubeTopZ + (i + 1) * stepLen,
          radius: whipStartRadius + (whipEndRadius - whipStartRadius) * ((t0 + t1) / 2),
        });
      }
    }

    // Optional L-wire (counterpoise): attaches at the bottom element's
    // lower endpoint, in series, so current flows straight through the
    // bend — a true inverted-L extension, not a parallel branch.
    if (lWireLength > 0) {
      const attachZ = baseHeight;
      const endX = lWireLength * Math.sin(lWireAzimuthRad);
      const endY = lWireLength * Math.cos(lWireAzimuthRad);
      const lWireTag = whipLen > 0 ? 3 + NUM_WHIP_STEPS : 3;
      const lWireSegs = autoSegment(lWireLength, MAX_FREQ_MHZ, 5);
      wires.push({
        tag: lWireTag,
        segments: lWireSegs,
        x1: 0,
        y1: 0,
        z1: attachZ,
        x2: endX,
        y2: endY,
        z2: attachZ,
        radius: tubeRadius,
      });
    }

    return wires;
  },

  generateExcitation(
    _params: Record<string, number>,
    wires: WireGeometry[]
  ): Excitation {
    // Feed at the bottom/top element junction (last segment of the bottom element).
    const bottomElement = wires[0]!;
    return {
      wire_tag: bottomElement.tag,
      segment: bottomElement.segments,
      voltage_real: 1.0,
      voltage_imag: 0.0,
    };
  },

  generateLoads(
    params: Record<string, number>,
    wires: WireGeometry[]
  ): LumpedLoad[] {
    const position = params.loading_coil_position ?? 0;
    if (position === 0) return [];

    const inductanceH = (params.loading_coil_inductance ?? 230) * 1e-6;
    const q = Math.max(params.loading_coil_q ?? 150, 1);
    const designFreqHz = (params.loading_coil_design_freq_mhz ?? 1.9) * 1e6;

    // R = X_L / Q at the chosen design frequency -- see the parameter's
    // description for why this is a fixed reference point, not a true
    // frequency-dependent loss model (NEC2 loads can't vary with frequency).
    const xl = 2 * Math.PI * designFreqHz * inductanceH;
    const coilResistance = xl / q;

    // Tag 2 is always the top element's tube section (see generateGeometry).
    const tubeWire = wires.find((w) => w.tag === 2);
    if (!tubeWire) return [];

    // position 1 = at the feedpoint (first segment of the tube, right at the
    // bottom/top junction) -- easier match, wider bandwidth, lower efficiency.
    // position 2 = at the tube/whip junction (last segment of the tube) --
    // better efficiency, much sharper/narrower resonance.
    const segment = position >= 2 ? tubeWire.segments : 1;

    return [
      {
        load_type: 0,
        wire_tag: tubeWire.tag,
        segment_start: segment,
        segment_end: segment,
        param1: coilResistance,
        param2: inductanceH,
        param3: 0,
      },
    ];
  },

  generateFeedpoints(
    params: Record<string, number>,
    _wires: WireGeometry[]
  ): FeedpointData[] {
    const bottomLength = params.bottom_length ?? 1.219;
    const baseHeight = params.base_height ?? 1.0;
    return [{ position: [0, 0, baseHeight + bottomLength], wireTag: 1 }];
  },

  defaultFrequencyRange(_params: Record<string, number>): FrequencyRange {
    // Multiband via the 4:1 balun — sweep the useful upper HF range (20m-10m).
    return {
      start_mhz: 13.0,
      stop_mhz: 29.7,
      steps: 101,
    };
  },
};
