"""Private filesystem document-store core — composition entry point.

This module splits the per-domain responsibilities into independent
submodules via mixin composition:
- `_fs_storage_utils`   — module-level utility functions and constants
- `_fs_storage_infra`   — shared infrastructure (batch / path / manifest / handle)
- `_fs_company_meta_core` — company-level metadata operations
- `_fs_source_document_core` — source-document CRUD / queries / file access
- `_fs_processed_core`  — processed-artifact operations
- `_fs_blob_core`       — blob / file-entry operations
- `_fs_maintenance_core` — rejection registry and cleanup
"""

from __future__ import annotations

from ._fs_blob_core import _FsBlobMixin
from ._fs_company_meta_core import _FsCompanyMetaMixin
from ._fs_maintenance_core import _FsMaintenanceMixin
from ._fs_processed_core import _FsProcessedMixin
from ._fs_source_document_core import _FsSourceDocumentMixin
from ._fs_storage_infra import _FsStorageInfra


class FsStorageCore(
    _FsCompanyMetaMixin,
    _FsSourceDocumentMixin,
    _FsProcessedMixin,
    _FsBlobMixin,
    _FsMaintenanceMixin,
    _FsStorageInfra,
):
    """Local-filesystem-based private document-store core.

    Composes functionality into a single class via mixin diamond inheritance
    while keeping the public API unchanged.
    """
