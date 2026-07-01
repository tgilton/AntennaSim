/**
 * Parasitic Vertical Array — elevated quarterwave vertical with a passive
 * (unfed) director or reflector element for vertical beam-forming.
 *
 * Models a 2-element vertical parasitic beam: a driven quarterwave vertical
 * and a second, unfed quarterwave vertical some distance away along the axis
 * of directivity — each with its OWN 2-radial counterpoise. Unlike a Yagi's
 * horizontal dipole elements (which need no ground return — current just
 * flows leg-to-leg), a vertical monopole has only one leg and depends on a
 * low-loss local counterpoise to carry induced current at all. A bare
 * parasitic monopole with no counterpoise, isolated above real lossy ground,
 * barely couples to the driven element regardless of spacing or detuning —
 * confirmed by simulation (~1 dB of directivity at best, essentially flat).
 * Every element, driven or parasitic, gets its own independent counterpoise,
 * matching how real 2-element vertical monopole arrays are built in practice
 * (AM broadcast towers, phased/parasitic vertical beams).
 *
 * The parasitic element is still purely passive: no feed, no wire connection
 * to the driven element or its radials — coupling happens only through the
 * RF field. It is either slightly longer (reflector — gain points away from
 * it, toward the driven element) or slightly shorter (director — gain points
 * from the driven element toward it). For this quarterwave-with-counterpoise
 * configuration, a REFLECTOR (longer, positive detune) produces dramatically
 * more gain and F/B than a director — the opposite of KJ6ER's halfwave
 * end-fed "Dominator" parasitic array, which uses a director. Different feed
 * structures couple differently; the two designs aren't interchangeable.
 *
 * Each element's counterpoise is fully independent: its own bearing, span,
 * length, and end height (droop/slope from feed_height). They default to
 * opposite orientations (driven aimed at 180°, parasitic at 0°) purely as a
 * sane starting point — aim them wherever your build actually points.
 *
 * NEC2 geometry:
 *   Tag 1              — driven vertical radiator, base at (0,0,feed_height)
 *   Tags 2…(1+N)        — driven element's radials (N = driven_radial_count)
 *   Tag (2+N)           — parasitic vertical radiator (unfed)
 *   Tags (3+N)…         — parasitic element's own radials (M = parasitic_radial_count)
 *
 * NEC2 coordinates: X=east, Y=north, Z=up.
 * Compass bearings: 0°=north (+Y), 90°=east (+X), 180°=south (-Y), 270°=west (-X).
 */

import type {
  AntennaTemplate,
  WireGeometry,
  Excitation,
  FeedpointData,
  FrequencyRange,
} from "./types";
import { autoSegment } from "../engine/segmentation";

export const parasiticVerticalTemplate: AntennaTemplate = {
  id: "parasitic-vertical",
  name: "Parasitic Vertical Array",
  nameShort: "Parasitic Vert",
  description:
    "Elevated quarterwave vertical plus a passive director or reflector — vertical beam-forming, Yagi-style.",
  longDescription:
    "A driven elevated quarterwave vertical paired with a second, unfed vertical placed along the " +
    "axis of directivity — each with its own independent 2-radial counterpoise. Unlike a Yagi's " +
    "horizontal dipole elements, a vertical monopole has only one leg and needs a local counterpoise " +
    "to carry induced current at all, so both elements are built the same way; only the passive " +
    "element has no feed and no wire connection to the driven side, coupling purely through the " +
    "field. Each element's counterpoise — bearing, span, radial length, and droop (feed height to " +
    "radial end height) — is fully independent, so you can match a real, asymmetric field build " +
    "rather than a mirrored idealization. Detuning the passive element longer than the driven " +
    "element makes it act as a reflector — gain forms away from it, toward the driven side. " +
    "Detuning it shorter makes it a director — gain forms from the driven element toward it. For " +
    "this quarterwave configuration a reflector (longer, positive detune) produces noticeably more " +
    "gain and front-to-back ratio than a director. Start with the defaults (auto λ/4 spacing, +5% " +
    "reflector detune) and sweep from there.",
  icon: "↑·↑",
  category: "directional",
  difficulty: "advanced",
  bands: ["40m", "20m", "17m", "15m", "12m", "10m", "6m"],
  defaultGround: { type: "average" },
  tips: [
    "For this quarterwave design, a REFLECTOR (positive detune, longer) gives much more gain and F/B than a director — try +5% to +10% first.",
    "Positive Parasitic Detune (longer element) = reflector — gain points away from it, toward the driven element.",
    "Negative Parasitic Detune (shorter element) = director — gain points from the driven element toward it, but couples more weakly here.",
    "Both elements need their own counterpoise to work — a bare parasitic monopole barely couples to the driven element regardless of tuning.",
    "Driven and Parasitic radial bearings, spans, lengths, and end heights are all independent — match your actual build instead of a mirrored idealization.",
    "Start with Parasitic Spacing at Auto (λ/4) — the 0.15λ–0.25λ range gives the best gain/F-B for a reflector configuration.",
    "Watch feedpoint impedance in the Smith/SWR view — a well-tuned reflector configuration lands close to 40-46Ω here, near a clean match.",
    "Use the Pattern tab's azimuth cut (at your takeoff angle) to read gain and front-to-back ratio directly.",
    "Always use an RF choke at the driven feedpoint — the coax feedline isn't part of this model, so the simulation already assumes a clean, choked feed.",
  ],
  relatedTemplates: ["elevated-quarterwave", "yagi", "loop-counterpoise-vertical"],

  parameters: [
    {
      key: "frequency",
      label: "Design Frequency",
      description: "Used to compute auto radiator length, auto spacing, and auto radial length",
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
      description: "Height of both verticals' base above ground (shared mast/tripod height)",
      unit: "m",
      min: 0.3,
      max: 20,
      step: 0.1,
      defaultValue: 2.0,
      decimals: 2,
    },
    {
      key: "radiator_length",
      label: "Driven Length",
      description: "Length of the driven (fed) vertical above the feedpoint. Set to 0 for automatic λ/4.",
      unit: "m",
      min: 0,
      max: 50,
      step: 0.1,
      defaultValue: 0,
      decimals: 2,
      zeroLabel: "Auto (λ/4)",
    },
    {
      key: "array_bearing",
      label: "Array Bearing",
      description: "Compass direction from the driven element toward the passive element — the axis of directivity",
      unit: "°",
      min: 0,
      max: 359,
      step: 1,
      defaultValue: 0,
      decimals: 0,
    },
    {
      key: "parasitic_spacing",
      label: "Parasitic Spacing",
      description: "Distance from driven to passive element along the array bearing. Set to 0 for automatic λ/4.",
      unit: "m",
      min: 0,
      max: 30,
      step: 0.1,
      defaultValue: 0,
      decimals: 2,
      zeroLabel: "Auto (λ/4)",
    },
    {
      key: "parasitic_detune",
      label: "Parasitic Detune",
      description:
        "Passive element length vs. driven length, as a %. Positive (longer) = reflector; negative (shorter) = director.",
      unit: "%",
      min: -15,
      max: 15,
      step: 0.5,
      defaultValue: 5,
      decimals: 1,
    },
    {
      key: "driven_radial_count",
      label: "Driven: Radials",
      description: "Number of counterpoise radials on the driven vertical (0=none, relying on ground image only)",
      unit: "",
      min: 0,
      max: 2,
      step: 1,
      defaultValue: 2,
      decimals: 0,
    },
    {
      key: "driven_radial_bearing",
      label: "Driven: Radial Bearing",
      description: "Compass direction the driven element's radial PAIR is centered on (0=north, 90=east, 180=south, 270=west)",
      unit: "°",
      min: 0,
      max: 359,
      step: 1,
      defaultValue: 180,
      decimals: 0,
    },
    {
      key: "driven_radial_span",
      label: "Driven: Radial Span",
      description: "Angle between the driven element's 2 radials (only used when Driven: Radials = 2)",
      unit: "°",
      min: 10,
      max: 180,
      step: 1,
      defaultValue: 90,
      decimals: 0,
    },
    {
      key: "driven_radial_length",
      label: "Driven: Radial Length",
      description: "Physical length of each driven-element radial wire. Set to 0 for automatic λ/4.",
      unit: "m",
      min: 0,
      max: 50,
      step: 0.1,
      defaultValue: 0,
      decimals: 2,
      zeroLabel: "Auto (λ/4)",
    },
    {
      key: "driven_radial_end_height",
      label: "Driven: Radial End Height",
      description: "Height of the far end of the driven element's radials above ground — sets its droop/slope with Feed Height",
      unit: "m",
      min: 0,
      max: 5,
      step: 0.05,
      defaultValue: 1.0,
      decimals: 2,
    },
    {
      key: "parasitic_radial_count",
      label: "Parasitic: Radials",
      description: "Number of counterpoise radials on the passive vertical (0=none — but a bare parasitic barely couples; see tips)",
      unit: "",
      min: 0,
      max: 2,
      step: 1,
      defaultValue: 2,
      decimals: 0,
    },
    {
      key: "parasitic_radial_bearing",
      label: "Parasitic: Radial Bearing",
      description: "Compass direction the passive element's radial PAIR is centered on — independent of the driven element's radials",
      unit: "°",
      min: 0,
      max: 359,
      step: 1,
      defaultValue: 0,
      decimals: 0,
    },
    {
      key: "parasitic_radial_span",
      label: "Parasitic: Radial Span",
      description: "Angle between the passive element's 2 radials (only used when Parasitic: Radials = 2)",
      unit: "°",
      min: 10,
      max: 180,
      step: 1,
      defaultValue: 90,
      decimals: 0,
    },
    {
      key: "parasitic_radial_length",
      label: "Parasitic: Radial Length",
      description: "Physical length of each passive-element radial wire. Set to 0 for automatic λ/4.",
      unit: "m",
      min: 0,
      max: 50,
      step: 0.1,
      defaultValue: 0,
      decimals: 2,
      zeroLabel: "Auto (λ/4)",
    },
    {
      key: "parasitic_radial_end_height",
      label: "Parasitic: Radial End Height",
      description: "Height of the far end of the passive element's radials above ground — sets its droop/slope with Feed Height",
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
    const feedHeight = params.feed_height ?? 2.0;
    const radiatorLengthParam = params.radiator_length ?? 0;
    const arrayBearingDeg = params.array_bearing ?? 0;
    const spacingParam = params.parasitic_spacing ?? 0;
    const detunePct = params.parasitic_detune ?? 5;

    const drivenRadialCount = Math.round(Math.min(2, Math.max(0, params.driven_radial_count ?? 2)));
    const drivenRadialBearingDeg = params.driven_radial_bearing ?? 180;
    const drivenRadialSpanDeg = params.driven_radial_span ?? 90;
    const drivenRadialLengthParam = params.driven_radial_length ?? 0;
    const drivenRadialEndHeight = params.driven_radial_end_height ?? 1.0;

    const parasiticRadialCount = Math.round(Math.min(2, Math.max(0, params.parasitic_radial_count ?? 2)));
    const parasiticRadialBearingDeg = params.parasitic_radial_bearing ?? 0;
    const parasiticRadialSpanDeg = params.parasitic_radial_span ?? 90;
    const parasiticRadialLengthParam = params.parasitic_radial_length ?? 0;
    const parasiticRadialEndHeight = params.parasitic_radial_end_height ?? 1.0;

    const wireDiamMm = params.wire_diameter ?? 2.0;

    const wavelength = 300.0 / freq;
    const quarterWave = wavelength / 4;

    const drivenLength =
      radiatorLengthParam > 0.01 ? radiatorLengthParam : quarterWave * 0.95;
    const parasiticLength = drivenLength * (1 + detunePct / 100);
    const spacing = spacingParam > 0.01 ? spacingParam : quarterWave;

    const radius = (wireDiamMm / 1000) / 2;
    const maxFreq = freq * 1.15;

    // Builds an independent radial pair (or single radial) for one element:
    // its own count, bearing, span, length, and end height (droop/slope).
    const buildRadials = (
      originX: number,
      originY: number,
      count: number,
      centerBearingDeg: number,
      spanDeg: number,
      lengthParam: number,
      endHeight: number,
      tagStart: number
    ): WireGeometry[] => {
      if (count <= 0) return [];
      const length = lengthParam > 0.01 ? lengthParam : quarterWave;
      const heightDrop = feedHeight - endHeight;
      const horizExtent =
        heightDrop >= length ? 0.05 : Math.sqrt(length * length - heightDrop * heightDrop);
      const bearings: number[] =
        count === 1 ? [centerBearingDeg] : [centerBearingDeg - spanDeg / 2, centerBearingDeg + spanDeg / 2];

      return bearings.map((bearingDeg, i) => {
        const b = (bearingDeg * Math.PI) / 180;
        const dx = horizExtent * Math.sin(b);
        const dy = horizExtent * Math.cos(b);
        return {
          tag: tagStart + i,
          segments: autoSegment(length, maxFreq, 7),
          x1: originX,
          y1: originY,
          z1: feedHeight,
          x2: originX + dx,
          y2: originY + dy,
          z2: endHeight,
          radius,
        };
      });
    };

    const wires: WireGeometry[] = [];

    // Tag 1: driven vertical at the origin
    wires.push({
      tag: 1,
      segments: autoSegment(drivenLength, maxFreq, 11),
      x1: 0,
      y1: 0,
      z1: feedHeight,
      x2: 0,
      y2: 0,
      z2: feedHeight + drivenLength,
      radius,
    });
    let tag = 2;

    // Driven radials — independently aimed, spanned, lengthed, and sloped
    const drivenRadials = buildRadials(
      0, 0,
      drivenRadialCount, drivenRadialBearingDeg, drivenRadialSpanDeg,
      drivenRadialLengthParam, drivenRadialEndHeight,
      tag
    );
    wires.push(...drivenRadials);
    tag += drivenRadials.length;

    // Passive element location, along array bearing at `spacing`.
    // It has no feed and no wire connection to the driven side — coupled purely
    // through the field — but it does get its own counterpoise, same as the driven
    // element, since a single-leg vertical monopole needs a local return path to
    // carry induced current at all.
    const bRad = (arrayBearingDeg * Math.PI) / 180;
    const px = spacing * Math.sin(bRad);
    const py = spacing * Math.cos(bRad);

    wires.push({
      tag,
      segments: autoSegment(parasiticLength, maxFreq, 11),
      x1: px,
      y1: py,
      z1: feedHeight,
      x2: px,
      y2: py,
      z2: feedHeight + parasiticLength,
      radius,
    });
    tag += 1;

    // Passive element's radials — independently aimed, spanned, lengthed, and sloped
    const parasiticRadials = buildRadials(
      px, py,
      parasiticRadialCount, parasiticRadialBearingDeg, parasiticRadialSpanDeg,
      parasiticRadialLengthParam, parasiticRadialEndHeight,
      tag
    );
    wires.push(...parasiticRadials);

    return wires;
  },

  generateExcitation(
    _params: Record<string, number>,
    _wires: WireGeometry[]
  ): Excitation {
    // Feed at the base of the driven vertical (tag 1, segment 1)
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
    const feedHeight = params.feed_height ?? 2.0;
    return [{ position: [0, 0, feedHeight], wireTag: 1 }];
  },

  defaultFrequencyRange(params: Record<string, number>): FrequencyRange {
    const freq = params.frequency ?? 14.175;
    const bw = freq * 0.09;
    return {
      start_mhz: Math.max(1, freq - bw / 2),
      stop_mhz: freq + bw / 2,
      steps: 51,
    };
  },
};
