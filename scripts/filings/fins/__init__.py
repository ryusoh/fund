"""Filings domain package (vendored subset: SEC download + read path)."""

import importlib
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from .tools import FinsToolLimits, FinsToolService, register_fins_read_tools

__all__ = [
    "FinsToolLimits",
    "FinsToolService",
    "register_fins_read_tools",
]


def __getattr__(name: str) -> Any:
    """Load the full read-tool stack only when a package-level export is used."""
    if name not in __all__:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    tools = importlib.import_module(".tools", __name__)
    value = getattr(tools, name)
    globals()[name] = value
    return value
