/**
 * Elevated Quarterwave Vertical with Symmetric Open-Arc Counterpoise.
 *
 * A quarterwave vertical radiator connected via a short spoke to a nearly-complete
 * open-arc counterpoise. The arc is symmetric: the spoke connects at the top (north)
 * and two equal arms sweep clockwise and counterclockwise to open ends near the
 * bottom (south). Current flows symmetrically both ways from the spoke junction,
 * like two curved radials.
 *
 * Why NOT a closed loop: a closed 1λ loop connected at one point = two λ/2 shorted
 * stubs in parallel → near-infinite impedance → SWR 6–20+.
 *
 * Why symmetric arms: the previous single-arm (330° arc) design sent all current
 * one direction, creating a heavily asymmetric radiation pattern and wrong resonance.
 *
 * Key new controls:
 *   arc_circumference_m  — explicit arc wire length (0 = auto 1λ at design freq)
 *   arc_height           — height of the arc plane (independent of feed height)
 *
 * NEC2 geometry:
 *   Tag 1        — vertical radiator, (0,0,feed_height) → (0,0,feed_height+radLen)
 *   Tags 2…N     — two equal arc arms (CW and CCW), each nSeg/2−1 segments
 *   Tag N+1      — spoke from (0,0,feed_height) to arc node 0 (north, at arc_height)
 *
 * NEC2 coordinates: X=east, Y=north, Z=up.
 * Compass bearings: 0°=north (+Y), 90°=east (+X), 270°=west (−X).
 */

import type {
  AntennaTemplate,
  WireGeometry,
  Excitation,
  FeedpointData,
  FrequencyRange,
} from "./types";
import { autoSegment } from "../engine/segmentation";

export const loopCounterpoiseVerticalTemplate: AntennaTemplate = {
  id: "loop-counterpoise-vertical",
  name: "Loop Counterpoise Vertical",
  nameShort: "Loop CP Vert",
  description:
    "Quarterwave vertical with a symmetric open-arc counterpoise — two curved radials joined at the feedpoint. Tilt to steer.",
  longDescription:
    "A quarterwave vertical radiator connected via a short spoke to a near-circular " +
    "open-arc counterpoise. Unlike two straight radials, the arc bends back on itself, " +
    "concentrating the counterpoise within a smaller ground footprint. " +
    "The arc is symmetric: the spoke meets the arc at the north end, and two equal arms " +
    "sweep clockwise and counterclockwise to open ends near the south. " +
    "Current flows symmetrically both ways, giving a balanced return path and an " +
    "omnidirectional radiation pattern when flat. " +
    "Tilting the arc breaks that symmetry — the high side and low side radiate with a " +
    "height and phase difference, creating forward gain and a front-to-back ratio. " +
    "Arc circumference and height are now independent of the design frequency so you " +
    "can tune them separately to find resonance at the desired band.",
  icon: "○↑",
  category: "vertical",
  difficulty: "advanced",
  bands: ["40m", "30m", "20m", "17m", "15m", "12m", "10m"],
  defaultGround: { type: "average" },
  tips: [
    "The arc is open — it does NOT close into a full loop; closing it kills SWR.",
    "Two symmetric arms means current flows equally CW and CCW → balanced counterpoise.",
    "Set Arc Circumference to 0 for automatic 1λ; enter a value to tune independently.",
    "Arc Height can differ from Feed Height — try the arc above or below the feedpoint.",
    "Start flat (Tilt 0°) to confirm resonance before adding directivity.",
    "12 arc sides is the minimum for electrical smoothness; use 16–24 for fine pattern work.",
    "Use the 'Azimuth at elevation' control in Pattern tab to cut at the actual takeoff angle.",
    "Always use an RF choke at the feedpoint — the coax shield must not become a third element.",
  ],
  relatedTemplates: ["elevated-quarterwave", "vertical"],

  parameters: [
    {
      key: "frequency",
      label: "Design Frequency",
      description: "Used to compute auto radiator length and auto arc circumference",
      unit: "MHz",
      min: 1,
      max: 60,
      step: 0.001,
      defaultValue: 14.175,
      decimals: 3,
    },
    {
      key: "feed_height",
      label: "Feed Height",
      description: "Height of the feedpoint (base of vertical radiator) above ground",
      unit: "m",
      min: 0.3,
      max: 20,
      step: 0.1,
      defaultValue: 2.0,
      decimals: 2,
    },
    {
      key: "radiator_length",
      label: "Radiator Length",
      description: "Length of the vertical element above the feedpoint. Set to 0 for automatic λ/4.",
      unit: "m",
      min: 0,
      max: 50,
      step: 0.1,
      defaultValue: 0,
      decimals: 2,
      zeroLabel: "Auto (λ/4)",
    },
    {
      key: "arc_circumference_m",
      label: "Arc Circumference",
      description: "Total length of the arc wire. Set to 0 for automatic 1λ at design frequency.",
      unit: "m",
      min: 0,
      max: 100,
      step: 0.5,
      defaultValue: 0,
      decimals: 1,
      zeroLabel: "Auto (1λ)",
    },
    {
      key: "arc_height",
      label: "Arc Height",
      description: "Height of the arc plane above ground — can differ from Feed Height",
      unit: "m",
      min: 0.3,
      max: 20,
      step: 0.1,
      defaultValue: 2.0,
      decimals: 2,
    },
    {
      key: "loop_segments",
      label: "Arc Sides",
      description: "Number of straight-wire sides in the arc polygon (8–24; must be even for symmetry)",
      unit: "",
      min: 8,
      max: 24,
      step: 2,
      defaultValue: 12,
      decimals: 0,
    },
    {
      key: "tilt_angle",
      label: "Tilt Angle",
      description: "Tilt the arc from horizontal: 0° = flat/omnidirectional, 15° = moderate directivity",
      unit: "°",
      min: 0,
      max: 45,
      step: 1,
      defaultValue: 0,
      decimals: 0,
    },
    {
      key: "tilt_bearing",
      label: "Tilt Bearing",
      description: "Compass direction the arc tilts UP toward (0°=north, 90°=east, 270°=west)",
      unit: "°",
      min: 0,
      max: 359,
      step: 1,
      defaultValue: 270,
      decimals: 0,
    },
    {
      key: "wire_diameter",
      label: "Wire Diameter",
      description: "Conductor diameter for all elements",
      unit: "mm",
      min: 0.5,
      max: 25,
      step: 0.5,
      defaultValue: 2.0,
      decimals: 1,
    },
  ],

  generateGeometry(params: Record<string, number>): WireGeometry[] {
    const freq        = params.frequency         ?? 14.175;
    const feedHeight  = params.feed_height       ?? 2.0;
    const radLenParam = params.radiator_length   ?? 0;
    const arcCircParam= params.arc_circumference_m ?? 0;
    const arcHeight   = params.arc_height        ?? 2.0;
    // Enforce even nSeg for symmetric two-arm geometry
    const nSegRaw     = Math.round(Math.min(24, Math.max(8, params.loop_segments ?? 12)));
    const nSeg        = nSegRaw % 2 === 0 ? nSegRaw : nSegRaw + 1;
    const tiltDeg     = params.tilt_angle        ?? 0;
    const tiltBearDeg = params.tilt_bearing      ?? 270;
    const wireDiamMm  = params.wire_diameter     ?? 2.0;

    const wl          = 300.0 / freq;
    const radLen      = radLenParam > 0.01 ? radLenParam : (wl / 4) * 0.95;

    // Arc radius: from explicit circumference or automatic 1λ
    const arcCirc     = arcCircParam > 0.01 ? arcCircParam : wl;
    const arcR        = arcCirc / (2 * Math.PI);

    const wireRadius  = (wireDiamMm / 1000) / 2;
    const maxFreq     = freq * 1.15;

    const wires: WireGeometry[] = [];

    // ── Tag 1: vertical radiator ──────────────────────────────────────────────
    wires.push({
      tag: 1,
      segments: autoSegment(radLen, maxFreq, 11),
      x1: 0, y1: 0, z1: feedHeight,
      x2: 0, y2: 0, z2: feedHeight + radLen,
      radius: wireRadius,
    });

    // ── Compute arc nodes ─────────────────────────────────────────────────────
    // Nodes 0…nSeg-1 at compass angles θ_i = i×360°/nSeg (clockwise from north).
    // Node 0 is at north (0°) — this is where the spoke connects.
    // Node nSeg/2 is at south (180°) — centre of the gap.
    //
    // Height: arc_height ± tilt correction.
    //   proj = nx·sin(tiltBearing) + ny·cos(tiltBearing)
    //   z_i  = arc_height + proj·tan(tilt_angle)
    const tiltRad  = (tiltDeg     * Math.PI) / 180;
    const tiltBRad = (tiltBearDeg * Math.PI) / 180;
    const tanTilt  = Math.tan(tiltRad);

    const nodes: [number, number, number][] = [];
    for (let i = 0; i < nSeg; i++) {
      const theta = (i * 2 * Math.PI) / nSeg;
      const nx    = arcR  * Math.sin(theta);   // east
      const ny    = arcR  * Math.cos(theta);   // north
      const proj  = nx * Math.sin(tiltBRad) + ny * Math.cos(tiltBRad);
      const nz    = Math.max(0.05, arcHeight + proj * tanTilt);
      nodes.push([nx, ny, nz]);
    }

    // ── Symmetric two-arm open arc ────────────────────────────────────────────
    // Spoke connects at node 0 (north). Two equal arms:
    //   Arm 1 (CW):  node 0 → 1 → 2 → … → (nSeg/2−1)   [open end near south-CW]
    //   Arm 2 (CCW): node 0 → (nSeg−1) → (nSeg−2) → … → (nSeg/2+1) [open end near south-CCW]
    // Gap: between node(nSeg/2−1) and node(nSeg/2+1), spanning ~two arc-steps at south.
    // Each arm has nSeg/2−1 segments.
    const nHalf = nSeg / 2;  // guaranteed even by the nSeg clamp above

    const dist = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) =>
      Math.sqrt((x2-x1)**2 + (y2-y1)**2 + (z2-z1)**2);

    let tag = 2;

    // Arm 1: CW from node 0 to node (nHalf−1)
    for (let i = 0; i < nHalf - 1; i++) {
      const [x1, y1, z1] = nodes[i]!;
      const [x2, y2, z2] = nodes[i + 1]!;
      wires.push({
        tag: tag++,
        segments: autoSegment(dist(x1, y1, z1, x2, y2, z2), maxFreq, 3),
        x1, y1, z1, x2, y2, z2,
        radius: wireRadius,
      });
    }

    // Arm 2: CCW from node 0 toward node (nHalf+1)
    // First wire: node 0 → node (nSeg−1)
    {
      const [x1, y1, z1] = nodes[0]!;
      const [x2, y2, z2] = nodes[nSeg - 1]!;
      wires.push({
        tag: tag++,
        segments: autoSegment(dist(x1, y1, z1, x2, y2, z2), maxFreq, 3),
        x1, y1, z1, x2, y2, z2,
        radius: wireRadius,
      });
    }
    // Remaining CCW wires: node (nSeg−1) down to node (nHalf+2), ending at node (nHalf+1)
    for (let i = nSeg - 1; i >= nHalf + 2; i--) {
      const [x1, y1, z1] = nodes[i]!;
      const [x2, y2, z2] = nodes[i - 1]!;
      wires.push({
        tag: tag++,
        segments: autoSegment(dist(x1, y1, z1, x2, y2, z2), maxFreq, 3),
        x1, y1, z1, x2, y2, z2,
        radius: wireRadius,
      });
    }

    // ── Spoke: vertical base → arc node 0 ────────────────────────────────────
    const [sx, sy, sz] = nodes[0]!;
    wires.push({
      tag: tag,
      segments: autoSegment(dist(0, 0, feedHeight, sx, sy, sz), maxFreq, 3),
      x1: 0,  y1: 0,  z1: feedHeight,
      x2: sx, y2: sy, z2: sz,
      radius: wireRadius,
    });

    return wires;
  },

  generateExcitation(_p: Record<string, number>, _w: WireGeometry[]): Excitation {
    return { wire_tag: 1, segment: 1, voltage_real: 1.0, voltage_imag: 0.0 };
  },

  generateFeedpoints(params: Record<string, number>, _w: WireGeometry[]): FeedpointData[] {
    return [{ position: [0, 0, params.feed_height ?? 2.0], wireTag: 1 }];
  },

  defaultFrequencyRange(params: Record<string, number>): FrequencyRange {
    const freq = params.frequency ?? 14.175;
    const bw   = freq * 0.15;
    return {
      start_mhz: Math.max(1, freq - bw / 2),
      stop_mhz:  freq + bw / 2,
      steps: 51,
    };
  },
};
