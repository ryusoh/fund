"""SEC-form processors subpackage (vendored subset)."""

from .bs_ten_k_processor import BsTenKFormProcessor
from .bs_ten_q_processor import BsTenQFormProcessor
from .bs_twenty_f_processor import BsTwentyFFormProcessor
from .registry import build_fins_processor_registry
from .sec_processor import SecProcessor
from .ten_k_processor import TenKFormProcessor
from .ten_q_processor import TenQFormProcessor
from .twenty_f_processor import TwentyFFormProcessor

__all__ = [
    "BsTenKFormProcessor",
    "BsTenQFormProcessor",
    "BsTwentyFFormProcessor",
    "SecProcessor",
    "TenKFormProcessor",
    "TenQFormProcessor",
    "TwentyFFormProcessor",
    "build_fins_processor_registry",
]
