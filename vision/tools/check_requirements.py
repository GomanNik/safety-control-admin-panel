# ============================================================
# File: tools/check_requirements.py
# Purpose:
# - Performs lightweight production-architecture checks for the
#   standalone offline vision service.
# - Verifies the current track-centric video processing pipeline:
#   PersonTrackingEngine -> TrackingFrameResult -> QualityGate
#   -> TrackEpisodeRegistry -> HumanObservation/TrackObservation
#   -> HeadwearDetector -> IncidentEngine -> Evidence/API.
# - Does not require removed DayPersonRegistry/ReID production modules.
# - Treats missing tests as warnings for the current offline stage.
# ============================================================

from __future__ import annotations

import argparse
import ast
from dataclasses import dataclass, field
from pathlib import Path


# ============================================================
# Paths / constants
# ============================================================

ROOT_DIR = Path.cwd()

CHECKED_SOURCE_DIRS = (
    "app",
    "tests",
    "tools",
    "docs",
)

TEXT_FILE_SUFFIXES = {
    ".py",
    ".md",
    ".txt",
    ".ps1",
    ".env",
}

REQUIRED_FILES = [
    # Core docs
    "docs/TARGET_LOGIC.md",
    "docs/ARCHITECTURE_MAP.md",
    "docs/REQUIREMENTS_MATRIX.md",
    "docs/AI_RULES.md",
    "docs/DEVELOPMENT_PLAN.md",

    # App/API entrypoints
    "app/__init__.py",
    "app/main.py",
    "app/config.py",
    "app/api/__init__.py",
    "app/api/routes_health.py",
    "app/api/routes_runtime.py",

    # Canonical schemas / API contracts
    "app/models/__init__.py",
    "app/models/schemas.py",

    # Current offline runtime chain
    "app/pipeline/__init__.py",
    "app/pipeline/runtime.py",
    "app/pipeline/person_tracking_engine.py",
    "app/pipeline/person_box_gate.py",
    "app/pipeline/tracking_types.py",
    "app/pipeline/quality_gate.py",
    "app/pipeline/track_episode_registry.py",
    "app/pipeline/human_observation.py",
    "app/pipeline/headwear_detector.py",
    "app/pipeline/incident_engine.py",
    "app/pipeline/track_diagnostics.py",

    # Storage / utilities
    "app/storage/__init__.py",
    "app/storage/frame_store.py",
    "app/utils/__init__.py",
    "app/utils/time_utils.py",

    # Operational tools
    "tools/check_requirements.py",
    "tools/project_index.py",
    "tools/run_quality_gate.ps1",
]

REQUIRED_TEST_FILES: list[str] = []

RECOMMENDED_TEST_FILES = [
    "tests/test_tracking_types.py",
    "tests/test_track_episode_registry.py",
    "tests/test_human_observation_new_pipeline.py",
    "tests/test_runtime_new_tracking_pipeline_static.py",
    "tests/test_headwear_observation_contract.py",
    "tests/test_incident_observation_contract.py",
]

REQUIRED_ARCHITECTURE_TOKENS = [
    # Runtime orchestration
    ("app/pipeline/runtime.py", "PersonTrackingEngine"),
    ("app/pipeline/runtime.py", "PersonBoxGate"),
    ("app/pipeline/runtime.py", "_append_rejected_person_overlay_items"),
    ("app/pipeline/runtime.py", "rejected_for_headwear"),
    ("app/pipeline/runtime.py", "TrackEpisodeRegistry"),
    ("app/pipeline/runtime.py", "build_track_observation_from_tracking"),
    ("app/pipeline/runtime.py", "HeadwearDetector"),
    ("app/pipeline/runtime.py", "IncidentEngine"),
    ("app/pipeline/runtime.py", "TrackDiagnosticsAnalyzer"),
    ("app/pipeline/runtime.py", "FrameStore"),
    ("app/pipeline/runtime.py", "export_processed_video"),

    # Tracking backend
    ("app/pipeline/person_tracking_engine.py", "model.track"),
    ("app/pipeline/person_tracking_engine.py", "PERSON_ALLOW_ULTRALYTICS_AUTO_DOWNLOAD"),
    ("app/pipeline/person_tracking_engine.py", "TrackingFrameResult"),
    ("app/pipeline/person_box_gate.py", "PersonBoxGate"),
    ("app/pipeline/person_box_gate.py", "PersonBoxDecision"),
    ("app/pipeline/person_box_gate.py", "accepted_for_headwear"),
    ("app/pipeline/person_box_gate.py", "workable"),
    ("app/pipeline/person_box_gate.py", "person_box_rejected_scene_occlusion"),
    ("app/pipeline/person_box_gate.py", "person_box_rejected_headwear_zone_occluded"),
    ("app/pipeline/person_box_gate.py", "person_box_rejected_exit_fragment"),
    ("app/pipeline/person_box_gate.py", "person_box_rejected_edge_fragment_for_headwear"),
    ("app/config.py", "PERSON_BOX_GATE_SCENE_OCCLUSION_ZONES"),

    # Tracking types
    ("app/pipeline/tracking_types.py", "TrackingBackendType"),
    ("app/pipeline/tracking_types.py", "TrackedPersonObservation"),
    ("app/pipeline/tracking_types.py", "TrackingFrameResult"),
    ("app/pipeline/tracking_types.py", "TrackingDiagnostics"),

    # Public schemas / API contracts
    ("app/models/schemas.py", "QualityAssessment"),
    ("app/models/schemas.py", "RuntimeStats"),
    ("app/models/schemas.py", "tracking_ready"),
    ("app/models/schemas.py", "tracking_failure_reason"),
    ("app/models/schemas.py", "IncidentCase"),
    ("app/models/schemas.py", "track_id_switch_suspicions"),
    ("app/models/schemas.py", "track_split_suspicions"),
    ("app/models/schemas.py", "person_bbox_rejected_count"),

    # Observation / quality / classifier
    ("app/pipeline/human_observation.py", "TrackObservation"),
    ("app/pipeline/human_observation.py", "build_track_observation_from_tracking"),
    ("app/pipeline/human_observation.py", "usable_for_incident"),
    ("app/pipeline/quality_gate.py", "QualityAssessment"),
    ("app/pipeline/quality_gate.py", "is_usable_for_headwear"),
    ("app/pipeline/quality_gate.py", "is_usable_for_tracking"),
    ("app/pipeline/headwear_detector.py", "HeadwearDetector"),
    ("app/pipeline/headwear_detector.py", "assess_observation"),
    ("app/pipeline/headwear_detector.py", "_extract_person_crop_bundle"),
    ("app/pipeline/headwear_detector.py", "person_crop_sent_to_model"),

    # Episode / incident / evidence
    ("app/pipeline/track_episode_registry.py", "TrackEpisodeRegistry"),
    ("app/pipeline/track_episode_registry.py", "update_frame"),
    ("app/pipeline/incident_engine.py", "process_headwear_assessment"),
    ("app/pipeline/incident_engine.py", "finish_video"),
    ("app/pipeline/incident_engine.py", "ComplianceSignal"),
    ("app/pipeline/track_diagnostics.py", "TrackDiagnosticsAnalyzer"),
    ("app/pipeline/track_diagnostics.py", "TrackDiagnosticEventType"),
    ("app/storage/frame_store.py", "save_incident_evidence"),
]

REQUIRED_DOC_TOKENS = [
    ("docs/TARGET_LOGIC.md", "PersonTrackingEngine"),
    ("docs/TARGET_LOGIC.md", "TrackEpisodeRegistry"),
    ("docs/TARGET_LOGIC.md", "TrackObservation"),
    ("docs/TARGET_LOGIC.md", "HeadwearDetector"),
    ("docs/TARGET_LOGIC.md", "IncidentEngine"),
    ("docs/TARGET_LOGIC.md", "track_id"),
    ("docs/TARGET_LOGIC.md", "track_episode_id"),
    ("docs/REQUIREMENTS_MATRIX.md", "QualityGate"),
    ("docs/REQUIREMENTS_MATRIX.md", "UNKNOWN"),
    ("docs/REQUIREMENTS_MATRIX.md", "CANDIDATE"),
    ("docs/REQUIREMENTS_MATRIX.md", "OPEN"),
]

FORBIDDEN_LEGACY_MODULES = [
    "track_person_matcher",
    "track_identity_profile",
    "person_identity_profile",
    "identity_features",
    "identity_scorer",
    "identity_diagnostics",
    "color_descriptor",
    "texture_descriptor",
    "appearance_signature",
    "daily_identity_registry",
    "day_registry_matcher",
]

REMOVED_PRODUCTION_MODULES = [
    "day_person_registry",
    "partial_candidate_registry",
    "scene_zones",
]

FORBIDDEN_RUNTIME_METHODS = [
    "_extract_identity_features",
    "_update_track_identity_profile",
    "_resolve_frame_fusion_assignments",
    "_sync_ownership_constraints_to_fusion",
    "_sync_forbidden_track_person_to_fusion",
]

ALLOWED_FORBIDDEN_TOKEN_FILES = {
    "tools/check_requirements.py",
}


# ============================================================
# Result model
# ============================================================

@dataclass(slots=True)
class CheckResult:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def add_error(self, message: str) -> None:
        self.errors.append(message)

    def add_warning(self, message: str) -> None:
        self.warnings.append(message)

    @property
    def ok(self) -> bool:
        return not self.errors

    def extend(self, other: "CheckResult") -> None:
        self.errors.extend(other.errors)
        self.warnings.extend(other.warnings)


# ============================================================
# CLI
# ============================================================

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Check architecture requirements for the offline vision service."
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Treat warnings as failures.",
    )
    parser.add_argument(
        "--root",
        default=None,
        help="Project root. Defaults to current working directory.",
    )
    parser.add_argument(
        "--skip-docs",
        action="store_true",
        help="Skip documentation vocabulary checks.",
    )
    parser.add_argument(
        "--skip-legacy-scan",
        action="store_true",
        help="Skip forbidden legacy identity token scan.",
    )
    return parser.parse_args()


# ============================================================
# Main
# ============================================================

def main() -> int:
    args = parse_args()
    root_dir = Path(args.root).expanduser().resolve() if args.root else ROOT_DIR.resolve()

    result = CheckResult()

    result.extend(check_required_files(root_dir=root_dir))
    result.extend(check_required_tests(root_dir=root_dir))
    result.extend(check_required_architecture_tokens(root_dir=root_dir))

    if not args.skip_docs:
        result.extend(check_required_doc_tokens(root_dir=root_dir))

    if not args.skip_legacy_scan:
        result.extend(check_removed_production_files(root_dir=root_dir))
        result.extend(check_removed_production_imports(root_dir=root_dir))
        result.extend(check_forbidden_legacy_files(root_dir=root_dir))
        result.extend(check_forbidden_imports(root_dir=root_dir))
        result.extend(check_forbidden_tokens(root_dir=root_dir))
        result.extend(check_forbidden_runtime_methods(root_dir=root_dir))

    print_report(result=result, strict=bool(args.strict))

    if result.errors:
        return 1

    if args.strict and result.warnings:
        return 1

    return 0


# ============================================================
# Checks
# ============================================================

def check_required_files(*, root_dir: Path) -> CheckResult:
    result = CheckResult()

    for relative_path in REQUIRED_FILES:
        path = root_dir / relative_path
        if not path.exists():
            result.add_error(f"missing required file: {relative_path}")
        elif not path.is_file():
            result.add_error(f"required path is not a file: {relative_path}")

    return result


def check_required_tests(*, root_dir: Path) -> CheckResult:
    result = CheckResult()

    for relative_path in REQUIRED_TEST_FILES:
        path = root_dir / relative_path
        if not path.exists():
            result.add_error(f"missing required production contract test: {relative_path}")

    for relative_path in RECOMMENDED_TEST_FILES:
        path = root_dir / relative_path
        if not path.exists():
            result.add_warning(f"recommended contract test is missing: {relative_path}")

    return result


def check_required_architecture_tokens(*, root_dir: Path) -> CheckResult:
    result = CheckResult()

    for relative_path, token in REQUIRED_ARCHITECTURE_TOKENS:
        path = root_dir / relative_path

        if not path.exists():
            result.add_error(f"cannot check architecture token {token!r}; file is missing: {relative_path}")
            continue

        content = read_text_safely(path)
        if token not in content:
            result.add_error(f"required architecture token {token!r} not found in {relative_path}")

    return result


def check_required_doc_tokens(*, root_dir: Path) -> CheckResult:
    result = CheckResult()

    for relative_path, token in REQUIRED_DOC_TOKENS:
        path = root_dir / relative_path

        if not path.exists():
            result.add_warning(f"cannot check doc token {token!r}; file is missing: {relative_path}")
            continue

        content = read_text_safely(path)
        if token not in content:
            result.add_warning(f"doc token {token!r} not found in {relative_path}")

    return result


def check_removed_production_files(*, root_dir: Path) -> CheckResult:
    result = CheckResult()

    for module_name in REMOVED_PRODUCTION_MODULES:
        path = root_dir / "app" / "pipeline" / f"{module_name}.py"
        if path.exists():
            relative_path = as_relative(path, root_dir)
            result.add_warning(
                f"removed production module still exists: {relative_path}. "
                "Keep it only if it is intentionally used as a compatibility shim."
            )

    return result


def check_removed_production_imports(*, root_dir: Path) -> CheckResult:
    result = CheckResult()

    for path in iter_python_files(root_dir=root_dir):
        relative_path = as_relative(path, root_dir)
        if relative_path in ALLOWED_FORBIDDEN_TOKEN_FILES:
            continue

        try:
            tree = ast.parse(read_text_safely(path), filename=str(path))
        except SyntaxError as error:
            result.add_error(f"syntax error while parsing {relative_path}: {error}")
            continue

        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    imported_name = alias.name
                    if is_removed_production_import(imported_name):
                        result.add_error(
                            f"removed production module import in {relative_path}: import {imported_name}"
                        )

            elif isinstance(node, ast.ImportFrom):
                module_name = node.module or ""
                if is_removed_production_import(module_name):
                    result.add_error(
                        f"removed production module import in {relative_path}: from {module_name} import ..."
                    )

    return result


def check_forbidden_legacy_files(*, root_dir: Path) -> CheckResult:
    result = CheckResult()

    for module_name in FORBIDDEN_LEGACY_MODULES:
        for relative_dir in ("app", "tests", "tools"):
            directory = root_dir / relative_dir
            if not directory.exists():
                continue

            for path in directory.rglob(f"{module_name}.py"):
                relative_path = as_relative(path, root_dir)
                result.add_error(
                    "forbidden legacy identity module exists: "
                    f"{relative_path}. Remove it or move it outside production/test/tooling paths."
                )

    return result


def check_forbidden_imports(*, root_dir: Path) -> CheckResult:
    result = CheckResult()

    for path in iter_python_files(root_dir=root_dir):
        relative_path = as_relative(path, root_dir)
        if relative_path in ALLOWED_FORBIDDEN_TOKEN_FILES:
            continue

        try:
            tree = ast.parse(read_text_safely(path), filename=str(path))
        except SyntaxError as error:
            result.add_error(f"syntax error while parsing {relative_path}: {error}")
            continue

        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    imported_name = alias.name
                    if is_forbidden_import(imported_name):
                        result.add_error(
                            f"forbidden legacy import in {relative_path}: import {imported_name}"
                        )

            elif isinstance(node, ast.ImportFrom):
                module_name = node.module or ""
                if is_forbidden_import(module_name):
                    result.add_error(
                        f"forbidden legacy import in {relative_path}: from {module_name} import ..."
                    )

                for alias in node.names:
                    imported_name = alias.name
                    if imported_name in FORBIDDEN_LEGACY_MODULES:
                        result.add_error(
                            f"forbidden legacy symbol import in {relative_path}: {imported_name}"
                        )

    return result


def check_forbidden_tokens(*, root_dir: Path) -> CheckResult:
    result = CheckResult()

    for path in iter_text_files(root_dir=root_dir):
        relative_path = as_relative(path, root_dir)
        if relative_path in ALLOWED_FORBIDDEN_TOKEN_FILES:
            continue

        content = read_text_safely(path)

        for token in FORBIDDEN_LEGACY_MODULES:
            if token in content:
                severity = "error" if relative_path.startswith(("app/", "tests/", "tools/")) else "warning"
                message = (
                    f"forbidden legacy identity token {token!r} found in {relative_path}. "
                    "The current architecture must not require handwritten identity core modules."
                )

                if severity == "error":
                    result.add_error(message)
                else:
                    result.add_warning(message)

    return result


def check_forbidden_runtime_methods(*, root_dir: Path) -> CheckResult:
    result = CheckResult()

    runtime_path = root_dir / "app/pipeline/runtime.py"
    if not runtime_path.exists():
        result.add_error("cannot check runtime forbidden methods; app/pipeline/runtime.py is missing")
        return result

    content = read_text_safely(runtime_path)

    for method_name in FORBIDDEN_RUNTIME_METHODS:
        if method_name in content:
            result.add_error(
                f"forbidden old identity runtime method {method_name!r} found in app/pipeline/runtime.py"
            )

    return result


# ============================================================
# Helpers
# ============================================================

def read_text_safely(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return path.read_text(encoding="cp1251")


def iter_python_files(*, root_dir: Path) -> list[Path]:
    files: list[Path] = []

    for relative_dir in CHECKED_SOURCE_DIRS:
        directory = root_dir / relative_dir
        if not directory.exists():
            continue

        files.extend(path for path in directory.rglob("*.py") if path.is_file())

    return sorted(files)


def iter_text_files(*, root_dir: Path) -> list[Path]:
    files: list[Path] = []

    for relative_dir in CHECKED_SOURCE_DIRS:
        directory = root_dir / relative_dir
        if not directory.exists():
            continue

        for path in directory.rglob("*"):
            if not path.is_file():
                continue
            if path.suffix.lower() not in TEXT_FILE_SUFFIXES:
                continue
            files.append(path)

    return sorted(files)


def is_forbidden_import(module_name: str) -> bool:
    normalized = str(module_name or "").strip()
    if not normalized:
        return False

    parts = normalized.split(".")
    return any(part in FORBIDDEN_LEGACY_MODULES for part in parts)


def is_removed_production_import(module_name: str) -> bool:
    normalized = str(module_name or "").strip()
    if not normalized:
        return False

    parts = normalized.split(".")
    return any(part in REMOVED_PRODUCTION_MODULES for part in parts)


def as_relative(path: Path, root_dir: Path) -> str:
    try:
        return path.resolve().relative_to(root_dir.resolve()).as_posix()
    except Exception:
        return path.as_posix()


def print_report(*, result: CheckResult, strict: bool) -> None:
    if result.errors:
        print("[requirements] errors:")
        for error in result.errors:
            print(f"  - {error}")

    if result.warnings:
        print("[requirements] warnings:")
        for warning in result.warnings:
            print(f"  - {warning}")

    if not result.errors and not result.warnings:
        print("[requirements] ok")
        return

    if result.errors:
        print(f"[requirements] failed: {len(result.errors)} error(s), {len(result.warnings)} warning(s)")
        return

    if strict and result.warnings:
        print(f"[requirements] failed in strict mode: {len(result.warnings)} warning(s)")
        return

    print(f"[requirements] passed with warnings: {len(result.warnings)} warning(s)")


if __name__ == "__main__":
    raise SystemExit(main())