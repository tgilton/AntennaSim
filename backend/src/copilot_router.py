"""
Copilot router — conversational antenna design assistant powered by Claude.

Accepts a chat message plus structured context about the current simulator state
(template, parameters, simulation results) and returns expert prose advice.
"""

import os
import logging
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

log = logging.getLogger("antsim.copilot")

router = APIRouter(prefix="/copilot", tags=["copilot"])

SYSTEM_PROMPT = """\
You are an expert antenna design assistant embedded in AntennaSim, a NEC2-based \
antenna simulator for amateur radio operators.

You help operators design, simulate, and optimise antennas — especially portable \
designs for POTA/field operations. You are familiar with the KJ6ER antenna family \
(PERformer elevated quarterwave, Dominator EFHW, Challenger OCF halfwave, \
DominatorArray parasitic beam) and the engineering principles behind them.

Your core knowledge:
- NEC2 antenna modelling (this simulator uses nec2c by Neoklis Kyriazis, 5B4AZ)
- Elevated feedpoints with elevated counterpoises or radials
- End-fed halfwave (EFHW) antennas with 49:1 or 56:1 ununs
- Off-center-fed (OCF) halfwave verticals with 4:1 ununs
- Elevated quarterwave verticals with 1–2 tuned elevated radials
- Parasitic director arrays for directional gain
- SWR, impedance, radiation pattern and near-field analysis
- Takeoff angle and DX propagation considerations
- HF bands 40m–6m; also familiar with 80m/160m designs

Interpreting simulation results:
- SWR < 1.5:1 is excellent; < 2:1 is fine without a tuner; > 3:1 needs adjustment
- SWR at 50 Ω is shown; EFHW/OCF feed impedances are transformed by the unun
- For DX, takeoff angles 10–25° are ideal; NVIS uses 60–90°
- Efficiency > 90 % is excellent; elevated radials greatly outperform ground-mounted systems
- Gain > 0 dBi over a reference dipole is meaningful; even +0.5 dBi is a real improvement
- The azimuth pattern at the takeoff angle shows true directional performance
- IMPORTANT: many length/spacing parameters use 0 as a sentinel meaning "auto-calculated" \
(e.g. a radial or driven-element length of 0 tells the template to compute an automatic \
λ/4 at the design frequency) — it does NOT mean the wire/radial is absent or missing. \
Never assume a 0 parameter means "no hardware there"; if you're unsure whether a specific \
parameter uses this convention, ask rather than assume.

When giving advice:
- Be specific and practical — the user may be in the field
- Suggest concrete parameter changes with values, not vague directions
- Relate results to real-world outcomes (will this work for DX? is it buildable?)
- If a comparison helps, reference the ground-mounted standard vs. elevated design
- Keep responses concise; the user is at the bench or outdoors
"""


class ConversationMessage(BaseModel):
    role: str   # "user" or "assistant"
    content: str


class SimulationResult(BaseModel):
    frequency_mhz: Optional[float] = None
    swr: Optional[float] = None
    gain_max_dbi: Optional[float] = None
    takeoff_angle_deg: Optional[float] = None
    efficiency_pct: Optional[float] = None
    impedance_r: Optional[float] = None
    impedance_x: Optional[float] = None


class AntennaContext(BaseModel):
    template_id: Optional[str] = None
    template_name: Optional[str] = None
    parameters: Optional[dict[str, float]] = None
    ground_type: Optional[str] = None
    frequency_start_mhz: Optional[float] = None
    frequency_stop_mhz: Optional[float] = None
    simulation_result: Optional[SimulationResult] = None


class CopilotChatRequest(BaseModel):
    message: str
    history: list[ConversationMessage] = []
    context: Optional[AntennaContext] = None


class CopilotChatResponse(BaseModel):
    response: str


def _build_context_section(ctx: AntennaContext) -> str:
    lines: list[str] = []

    if ctx.template_name:
        lines.append(f"Antenna template: {ctx.template_name} (id: {ctx.template_id})")

    if ctx.parameters:
        params = ", ".join(f"{k}={v}" for k, v in ctx.parameters.items())
        lines.append(f"Parameters: {params}")

    if ctx.ground_type:
        lines.append(f"Ground model: {ctx.ground_type}")

    if ctx.frequency_start_mhz and ctx.frequency_stop_mhz:
        lines.append(
            f"Frequency sweep: {ctx.frequency_start_mhz}–{ctx.frequency_stop_mhz} MHz"
        )

    if ctx.simulation_result:
        r = ctx.simulation_result
        sim: list[str] = []
        if r.frequency_mhz is not None:
            sim.append(f"at {r.frequency_mhz:.3f} MHz")
        if r.swr is not None:
            sim.append(f"SWR {r.swr:.2f}:1")
        if r.gain_max_dbi is not None:
            sim.append(f"max gain {r.gain_max_dbi:.2f} dBi")
        if r.takeoff_angle_deg is not None:
            sim.append(f"takeoff {r.takeoff_angle_deg:.0f}°")
        if r.efficiency_pct is not None:
            sim.append(f"efficiency {r.efficiency_pct:.0f}%")
        if r.impedance_r is not None and r.impedance_x is not None:
            sign = "+" if r.impedance_x >= 0 else ""
            sim.append(f"Z = {r.impedance_r:.1f}{sign}j{r.impedance_x:.1f} Ω")
        if sim:
            lines.append(f"Last simulation: {', '.join(sim)}")

    if not lines:
        return ""

    return "\n\nCurrent simulator state:\n" + "\n".join(f"  • {l}" for l in lines)


@router.post("/chat", response_model=CopilotChatResponse)
def copilot_chat(request: CopilotChatRequest) -> CopilotChatResponse:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        log.warning("ANTHROPIC_API_KEY not set — copilot unavailable")
        return CopilotChatResponse(
            response=(
                "Copilot requires an ANTHROPIC_API_KEY environment variable. "
                "Add it to your .env file and restart the backend."
            )
        )

    try:
        import anthropic
    except ImportError:
        return CopilotChatResponse(
            response="Python anthropic package is not installed. Run: pip install anthropic"
        )

    # Build system prompt, optionally appending current state
    system = SYSTEM_PROMPT
    if request.context:
        ctx_block = _build_context_section(request.context)
        if ctx_block:
            system += ctx_block

    # Build message list
    messages: list[dict] = [
        {"role": m.role, "content": m.content} for m in request.history
    ]
    messages.append({"role": "user", "content": request.message})

    client = anthropic.Anthropic(api_key=api_key)

    log.info("Copilot chat: %d history messages, context=%s",
             len(request.history), bool(request.context))

    api_response = client.messages.create(
        model="claude-opus-4-8",
        max_tokens=1024,
        system=system,
        messages=messages,
    )

    text = "".join(
        block.text for block in api_response.content if block.type == "text"
    )
    log.info("Copilot response: %d chars", len(text))
    return CopilotChatResponse(response=text)
