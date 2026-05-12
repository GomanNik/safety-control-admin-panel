from pathlib import Path


ROOT_DIR = Path.cwd()


def test_runtime_export_files_exist():
    required_files = [
        "app/api/routes_runtime.py",
        "app/pipeline/runtime.py",
    ]

    missing = [
        relative_path
        for relative_path in required_files
        if not (ROOT_DIR / relative_path).exists()
    ]

    assert not missing, f"Missing runtime export files: {missing}"
