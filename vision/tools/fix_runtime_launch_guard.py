# ============================================================
# File: tools/fix_runtime_launch_guard.py
# Purpose:
# - Apply a minimal, in-place fix to app/config.py.
# - Explicit require_real_headwear=True must not be disabled by
#   PERSON_CROP_COLLECTION_ENABLED / collection mode.
# - Collection mode may relax real-headwear validation only when
#   require_real_headwear is not explicitly passed by the caller.
# ============================================================

from __future__ import annotations

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "app" / "config.py"

OLD = """        if collection_mode:\n            must_require_real_headwear = False\n"""

NEW = """        if collection_mode and require_real_headwear is None:\n            must_require_real_headwear = False\n"""

REGEX = re.compile(
    r"(?P<indent>\s*)if\s+collection_mode\s*:\n"
    r"(?P=indent)    must_require_real_headwear\s*=\s*False\n"
)


def main() -> None:
    if not CONFIG_PATH.is_file():
        raise SystemExit(f"config.py not found: {CONFIG_PATH}")

    text = CONFIG_PATH.read_text(encoding="utf-8")

    if NEW in text:
        print("Already fixed: explicit require_real_headwear=True is preserved.")
        return

    if OLD in text:
        updated = text.replace(OLD, NEW, 1)
    else:
        match = REGEX.search(text)
        if not match:
            raise SystemExit(
                "Could not find the collection_mode guard block in app/config.py. "
                "Patch manually: change `if collection_mode:` to "
                "`if collection_mode and require_real_headwear is None:` inside "
                "validate_runtime_launch_or_raise()."
            )
        indent = match.group("indent")
        updated = text[: match.start()] + (
            f"{indent}if collection_mode and require_real_headwear is None:\n"
            f"{indent}    must_require_real_headwear = False\n"
        ) + text[match.end():]

    backup = CONFIG_PATH.with_suffix(CONFIG_PATH.suffix + ".before_runtime_launch_guard_fix")
    backup.write_text(text, encoding="utf-8")
    CONFIG_PATH.write_text(updated, encoding="utf-8")

    print(f"Fixed: {CONFIG_PATH}")
    print(f"Backup: {backup}")


if __name__ == "__main__":
    main()
