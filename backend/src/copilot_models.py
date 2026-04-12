from pydantic import BaseModel
from typing import Literal


class FrequencySweep(BaseModel):
    start_mhz: float = 14.0
    stop_mhz: float = 14.35
    points: int = 201


class GroundSettings(BaseModel):
    model: Literal["free_space", "perfect", "average", "poor", "good"] = "average"


class DipoleGeometry(BaseModel):
    total_length_m: float = 10.0
    height_m: float = 10.0
    wire_radius_m: float = 0.001


class SimulationState(BaseModel):
    antenna_type: Literal["dipole"] = "dipole"
    geometry: DipoleGeometry = DipoleGeometry()
    sweep: FrequencySweep = FrequencySweep()
    ground: GroundSettings = GroundSettings()