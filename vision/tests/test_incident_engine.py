from pathlib import Path


ROOT_DIR = Path.cwd()


def test_single_frame_incident_rule_is_documented():
    content = (ROOT_DIR / "docs" / "REQUIREMENTS_MATRIX.md").read_text(encoding="utf-8")

    assert "Инцидент нельзя открыть по одному кадру" in content
    assert "REQ-010" in content
