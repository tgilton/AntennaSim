/**
 * Elevated Quarterwave Vertical antenna template.
 *
 * Models a quarterwave vertical with 1 or 2 elevated, tuned radials (counterpoises)
 * at arbitrary compass bearings and a configurable end height.
 * This matches the KJ6ER PERformer family and similar designs where the feedpoint
 * is mounted on a PVC mast or tripod ~1-1.5 m above ground and the radials droop
 * slightly from the feedpoint to their stake ends (~1 m).
 *
 * Key design freedom:
 *   - Radial length is user-specified (0 = auto λ/4)
 *   - Radial bearing and span are independent — sweep span from 90° (directional)
 *     to 180° (omnidirectional) to study pattern changes
 *
 * NEC2 coordinates: X=east, Y=north, Z=up.
 * Compass bearings: 0°=north(+Y), 90°=east(+X), 180°=south(-Y), 270°=west(-X).
 */

import type {
  AntennaTemplate,
  WireGeometry,
  Excitation,
  FeedpointData,
  FrequencyRange,
} from "./types";
import { autoSegment } from "../engine/segmentation";

export const elevatedQuarterwaveTemplate: AntennaTemplate = {
  id: "elevated-quarterwave",
  name: "Elevated Quarterwave Vertical",
  nameShort: "EQ Vertical",
  description:
    "Quarterwave vertical with 1–2 elevated radials at arbitrary angles — models the PERformer-style antenna.",
  longDescription:
    "An elevated quarterwave vertical with 1 or 2 elevated, tuned radials (counterpoises). " +
    "The feedpoint sits on a PVC mast or tripod 1–2 m above ground, isolating the antenna " +
    "from ground losses that plague traditional ground-mounted verticals. " +
    "Radials droop gently from the feedpoint to their stake ends (~1 m high), " +
    "acting as a tuned counterpoise rather than a lossy ground screen. " +
    "The angle between two radials controls directionality: 90° gives modest forward gain " +
    "and a front-to-back ratio (PERformer configuration), while 180° (opposite) produces " +
    "a nearly omnidirectional pattern. Use the takeoff-angle azimuth plot to study these effects. " +
    "Set radial length to 0 for automatic λ/4 tuned length, or enter a specific length " +
    "to simulate the wire you've already cut.",
  icon: "↑",
  category: "vertical",
  difficulty: "intermediate",
  bands: ["40m", "20m", "17m", "15m", "12m", "10m", "6m"],
  defaultGround: { type: "average" },
  tips: [
    "Radial span 90° (PERformer config) gives ~0.3–0.5 dBi forward gain and 3–4 dB front-to-back.",
    "Radial span 180° (opposite each other) gives an omnidirectional pattern.",
    "Point the bisector of your two radials toward your target for maximum gain.",
    "Radial end height of 1 m mimics a stake-supported radial wire in the field.",
    "Feed height of 1.3 m matches a 40\" PVC tube + spike mount (PERformer standard).",
    "Always include an RF choke at the feedpoint — the coax shield must not become a third radial.",
    "Set radial length to 0 for automatic λ/4; enter a real length to model a wire you've cut.",
    "Compare 1 radial vs 2 radials at 90° to see the efficiency and pattern improvement.",
  ],
  relatedTemplates: ["vertical", "efhw"],

  parameters: [
    {
      key: "frequency",
      label: "Design Frequency",
      description: "Center frequency — sets radiator length and auto radial length",
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
      description: "Height of feedpoint above ground (PVC mast / tripod height)",
      unit: "m",
      min: 0.1,
      max: 10,
      step: 0.05,
      defaultValue: 1.3,
      decimals: 2,
    },
    {
      key: "radial_count",
      label: "Radials",
      description: "Number of elevated radial wires (1 or 2)",
      unit: "",
      min: 1,
      max: 2,
      step: 1,
      defaultValue: 2,
      decimals: 0,
    },
    {
      key: "radial_1_bearing",
      label: "Radial 1 Bearing",
      description: "Compass direction of the first radial (0=north, 90=east, 180=south, 270=west)",
      unit: "°",
      min: 0,
      max: 359,
      step: 1,
      defaultValue: 270,
      decimals: 0,
    },
    {
      key: "radial_span",
      label: "Radial Span",
      description: "Angle between the two radials (only used when Radials = 2). 90°=directional, 180°=omnidirectional",
      unit: "°",
      min: 10,
      max: 180,
      step: 1,
      defaultValue: 90,
      decimals: 0,
    },
    {
      key: "radial_length",
      label: "Radial Length",
      description: "Physical length of each radial wire. Slide to 0 for automatic λ/4 at design frequency. Common values: 20m≈5.3m, 17m≈4.1m, 15m≈3.5m, 10m≈2.5m.",
      unit: "m",
      min: 0,
      max: 50,
      step: 0.1,
      defaultValue: 0,
      decimals: 2,
      zeroLabel: "Auto (λ/4)",
    },
    {
      key: "radial_end_height",
      label: "Radial End Height",
      description: "Height of the far end of each radial above ground (stake / support height)",
      unit: "m",
      min: 0,
      max: 5,
      step: 0.05,
      defaultValue: 1.0,
      decimals: 2,
    },
    {
      key: "wire_diameter",
      label: "Wire Diameter",
      description: "Conductor diameter of all wires",
      unit: "mm",
      min: 0.5,
      max: 25,
      step: 0.5,
      defaultValue: 2.0,
      decimals: 1,
    },
  ],

  generateGeometry(params: Record<string, number>): WireGeometry[] {
    const freq = params.frequency ?? 14.175;
    const feedHeight = params.feed_height ?? 1.3;
    const radialCount = Math.round(Math.min(2, Math.max(1, params.radial_count ?? 2)));
    const bearing1Deg = params.radial_1_bearing ?? 270;
    const spanDeg = params.radial_span ?? 90;
    const radialLengthParam = params.radial_length ?? 0;
    const radialEndHeight = params.radial_end_height ?? 1.0;
    const wireDiamMm = params.wire_diameter ?? 2.0;

    const wavelength = 300.0 / freq;
    const quarterWave = wavelength / 4;

    // Radiator: λ/4 with ~5% velocity-factor shortening for a metal whip
    const radiatorLength = quarterWave * 0.95;

    // Radial length: 0 = auto λ/4 (no shortening — wire radials are close to free-space λ/4)
    const radialLength = radialLengthParam > 0.01 ? radialLengthParam : quarterWave;

    const radius = (wireDiamMm / 1000) / 2;
    const maxFreq = freq * 1.15;
    const vertSegs = autoSegment(radiatorLength, maxFreq, 11);
    const radSegs = autoSegment(radialLength, maxFreq, 7);

    const wires: WireGeometry[] = [];

    // Tag 1: vertical radiator, base at feedpoint, tip pointing up
    wires.push({
      tag: 1,
      segments: vertSegs,
      x1: 0,
      y1: 0,
      z1: feedHeight,
      x2: 0,
      y2: 0,
      z2: feedHeight + radiatorLength,
      radius,
    });

    // Radials: droop from (0,0,feedHeight) to (endX, endY, radialEndHeight)
    // Height drop from feedpoint to radial end
    const heightDrop = feedHeight - radialEndHeight;

    // Horizontal extent from feedpoint to radial end (Pythagorean)
    // If the height drop >= radialLength the radial would be nearly vertical —
    // clamp to a small horizontal extent so NEC2 doesn't get a degenerate wire.
    const horizExtent =
      heightDrop >= radialLength
        ? 0.05
        : Math.sqrt(radialLength * radialLength - heightDrop * heightDrop);

    // Build bearing list for each radial
    const bearings: number[] = [bearing1Deg];
    if (radialCount >= 2) {
      bearings.push(bearing1Deg + spanDeg);
    }

    bearings.forEach((bearingDeg, i) => {
      // Convert compass bearing to NEC2 XY
      // Compass: 0=north=+Y, 90=east=+X  →  endX = horiz * sin(b), endY = horiz * cos(b)
      const b = (bearingDeg * Math.PI) / 180;
      const endX = horizExtent * Math.sin(b);
      const endY = horizExtent * Math.cos(b);

      wires.push({
        tag: i + 2,
        segments: radSegs,
        x1: 0,
        y1: 0,
        z1: feedHeight,
        x2: endX,
        y2: endY,
        z2: radialEndHeight,
        radius,
      });
    });

    return wires;
  },

  generateExcitation(
    _params: Record<string, number>,
    _wires: WireGeometry[]
  ): Excitation {
    // Feed at the base of the vertical (segment 1 = bottom)
    return {
      wire_tag: 1,
      segment: 1,
      voltage_real: 1.0,
      voltage_imag: 0.0,
    };
  },

  generateFeedpoints(
    params: Record<string, number>,
    _wires: WireGeometry[]
  ): FeedpointData[] {
    const feedHeight = params.feed_height ?? 1.3;
    return [{ position: [0, 0, feedHeight], wireTag: 1 }];
  },

  defaultFrequencyRange(params: Record<string, number>): FrequencyRange {
    const freq = params.frequency ?? 14.175;
    const bw = freq * 0.12;
    return {
      start_mhz: Math.max(1, freq - bw / 2),
      stop_mhz: freq + bw / 2,
      steps: 51,
    };
  },
};
