"""Financial-report domain enum definitions."""

from __future__ import annotations

from enum import Enum


class Market(str, Enum):
    """Market enum."""

    US = "US"
    HK = "HK"
    CN = "CN"


class SourceKind(str, Enum):
    """Document source enum."""

    FILING = "filing"
    MATERIAL = "material"
