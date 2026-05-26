# ============================================================
# File: vision/tests/test_headwear_gate.py
# Purpose:
# - Static requirement test: unsafe headwear decisions must prefer UNKNOWN.
# ============================================================

from pathlib import Path


ROOT_DIR = Path.cwd()


def test_headwear_unknown_rule_is_documented():
    content = (ROOT_DIR / "docs" / "REQUIREMENTS_MATRIX.md").read_text(encoding="utf-8")

    assert "Headwear `UNKNOWN` лучше ложного `VIOLATION`" in content
    assert "REQ-013" in content
