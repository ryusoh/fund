"""fins domain processor registry builder (vendored subset: SEC form processors only).

This module is responsible for building the SEC-form-specific processor registry.
Design principle: registration is triggered explicitly by the caller; it is not
performed automatically at module import time.
"""

from __future__ import annotations

from scripts.vendor.filings.engine.processors.processor_registry import ProcessorRegistry
from scripts.vendor.filings.log import Log

from .bs_ten_k_processor import BsTenKFormProcessor
from .bs_ten_q_processor import BsTenQFormProcessor
from .bs_twenty_f_processor import BsTwentyFFormProcessor
from .sec_processor import SecProcessor
from .ten_k_processor import TenKFormProcessor
from .ten_q_processor import TenQFormProcessor
from .twenty_f_processor import TwentyFFormProcessor

_SPECIAL_FORM_PRIORITY = 200
_REPORT_FORM_FALLBACK_PRIORITY = 190
_SEC_PROCESSOR_PRIORITY = 120

MODULE = "FINS.PROCESSOR_REGISTRY"


def build_fins_processor_registry() -> ProcessorRegistry:
    """Build the fins SEC form processor registry.

    Registration order:
    1. Register the SEC-form-specific processors (10-K/10-Q/20-F).
       the BS path is the primary processor; the edgartools path is the fallback.
    2. Register `SecProcessor` as the generic SEC fallback.

    Args:
        None.

    Returns:
        newly created and fully registered `ProcessorRegistry`.

    Raises:
        RuntimeError: raised when the registration flow fails.
    """

    registry = ProcessorRegistry()
    # BsTenKFormProcessor is the primary 10-K path; TenKFormProcessor is the fallback
    registry.register(
        BsTenKFormProcessor,
        name="ten_k_section_processor",
        priority=_SPECIAL_FORM_PRIORITY,
        overwrite=True,
    )
    registry.register(
        TenKFormProcessor,
        name="ten_k_section_processor_fallback",
        priority=_REPORT_FORM_FALLBACK_PRIORITY,
        overwrite=True,
    )
    # BsTenQFormProcessor is the primary 10-Q path; TenQFormProcessor is the fallback
    registry.register(
        BsTenQFormProcessor,
        name="ten_q_section_processor",
        priority=_SPECIAL_FORM_PRIORITY,
        overwrite=True,
    )
    registry.register(
        TenQFormProcessor,
        name="ten_q_section_processor_fallback",
        priority=_REPORT_FORM_FALLBACK_PRIORITY,
        overwrite=True,
    )
    # BsTwentyFFormProcessor is the primary 20-F path; TwentyFFormProcessor is the fallback
    registry.register(
        BsTwentyFFormProcessor,
        name="twenty_f_section_processor",
        priority=_SPECIAL_FORM_PRIORITY,
        overwrite=True,
    )
    registry.register(
        TwentyFFormProcessor,
        name="twenty_f_section_processor_fallback",
        priority=_REPORT_FORM_FALLBACK_PRIORITY,
        overwrite=True,
    )
    registry.register(
        SecProcessor,
        name="sec_processor",
        priority=_SEC_PROCESSOR_PRIORITY,
        overwrite=True,
    )
    Log.verbose("fins processor registry built", module=MODULE)
    return registry
