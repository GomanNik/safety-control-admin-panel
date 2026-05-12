# ============================================================
# File: vision/tests/test_config_negative_extra.py
# Purpose:
# - Broad negative tests for configuration parsing and validation.
# - Attacks boundary values, unsupported modes, malformed env values,
#   path resolution and launch-time safety checks.
# ============================================================

from __future__ import annotations

from pathlib import Path

import pytest

from app import config
from app.config import Settings


def _settings(**overrides) -> Settings:
    base = {
        "camera_id": "cam_1",
        "evidence_dir": "./data/evidence",
        "processed_video_dir": "./data/processed",
        "person_tracking_backend": "disabled",
        "person_tracking_require_external": True,
        "person_tracking_allow_dev_simple": False,
        "person_tracking_min_confidence": 0.35,
        "person_tracking_person_class_id": 0,
        "person_detector_mode": "placeholder",
        "headwear_detector_mode": "placeholder",
        "backend_enabled": False,
        "backend_base_url": "",
        "headwear_model_path": "",
        "body_embedder_mode": "handcrafted",
        "body_embedder_strict_backend": False,
        "body_embedding_model_path": "",
        "body_embedding_input_width": 64,
        "body_embedding_input_height": 128,
        "reid_face_weight": 0.65,
        "reid_body_weight": 0.15,
        "reid_position_weight": 0.08,
        "reid_time_weight": 0.04,
        "reid_size_weight": 0.08,
        "processed_video_fourcc": "mp4v",
        "tracker_iou_threshold": 0.3,
        "tracker_match_threshold": 0.35,
        "tracker_min_hits": 1,
        "tracker_max_age_frames": 20,
        "identity_tentative_min_valid_hits": 3,
        "identity_confirm_min_valid_hits": 6,
        "identity_verified_reentry_min_sec": 3.0,
        "identity_verified_reentry_max_sec": 60.0,
        "person_class_ids": (),
    }
    base.update(overrides)
    return Settings(**base)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ('"abc"', "abc"),
        ("'abc'", "abc"),
        (" abc ", "abc"),
        ('"unterminated', '"unterminated'),
        ("'',", "'',"),
    ],
)
def test_unquote_env_value_handles_quotes_and_malformed_strings(raw: str, expected: str) -> None:
    assert config._unquote_env_value(raw) == expected


@pytest.mark.parametrize("raw", ["1", "true", "TRUE", "yes", "on", " On "])
def test_parse_bool_accepts_truthy_values(raw: str) -> None:
    assert config._parse_bool(raw) is True


@pytest.mark.parametrize("raw", ["0", "false", "FALSE", "no", "off", " Off "])
def test_parse_bool_accepts_false_values(raw: str) -> None:
    assert config._parse_bool(raw) is False


@pytest.mark.parametrize("raw", ["", "maybe", "2", "truth", "none"])
def test_parse_bool_rejects_ambiguous_values(raw: str) -> None:
    with pytest.raises(ValueError):
        config._parse_bool(raw)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (None, "auto"),
        ("true", "true"),
        ("yes", "true"),
        ("1", "true"),
        ("false", "false"),
        ("no", "false"),
        ("0", "false"),
        ("unsupported", "auto"),
    ],
)
def test_normalize_tristate_is_safe_for_invalid_values(raw: str | None, expected: str) -> None:
    assert config._normalize_tristate(raw) == expected


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (0.0, True),
        (1.0, True),
        (0.5, True),
        (-0.001, False),
        (1.001, False),
    ],
)
def test_in_unit_interval_checks_hard_boundaries(value: float, expected: bool) -> None:
    assert config._in_unit_interval(value) is expected


@pytest.mark.parametrize("value", ["rtsp://cam", "rtsps://cam", "http://x", "https://x", "udp://x", "tcp://x"])
def test_probable_url_recognizes_supported_stream_schemes(value: str) -> None:
    assert config._is_probable_url(value) is True


@pytest.mark.parametrize("value", ["", "file.mp4", "C:/video.mp4", "ftp://x", "relative/path"])
def test_probable_url_rejects_non_stream_paths(value: str) -> None:
    assert config._is_probable_url(value) is False


def test_load_env_file_ignores_comments_bad_lines_and_existing_env(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text(
        "# comment\n"
        "BAD_LINE\n"
        "EXISTING=value_from_file\n"
        "NEW_VALUE='quoted value'\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("EXISTING", "already_set")
    monkeypatch.delenv("NEW_VALUE", raising=False)

    assert config._load_env_file(env_file) == env_file
    assert config._first_env_value("EXISTING") == "already_set"
    assert config._first_env_value("NEW_VALUE") == "quoted value"


def test_load_env_file_returns_none_for_missing_file(tmp_path: Path) -> None:
    assert config._load_env_file(tmp_path / "missing.env") is None


@pytest.mark.parametrize(
    ("kwargs", "expected_message"),
    [
        ({"app_name": ""}, "APP_NAME"),
        ({"app_host": ""}, "APP_HOST"),
        ({"app_port": 0}, "APP_PORT"),
        ({"app_port": 65536}, "APP_PORT"),
        ({"log_level": "TRACE"}, "LOG_LEVEL"),
    ],
)
def test_app_config_validation_rejects_invalid_app_values(kwargs: dict[str, object], expected_message: str) -> None:
    settings = _settings(**kwargs)

    with pytest.raises(ValueError, match=expected_message):
        settings.validate_app_config_or_raise()


@pytest.mark.parametrize(
    ("kwargs", "expected_message"),
    [
        ({"camera_id": ""}, "CAMERA_ID"),
        ({"evidence_dir": ""}, "EVIDENCE_DIR"),
        ({"processed_video_dir": ""}, "PROCESSED_VIDEO_DIR"),
        ({"startup_source_probe_timeout_sec": 0}, "STARTUP_SOURCE_PROBE_TIMEOUT_SEC"),
        ({"startup_source_probe_poll_interval_ms": 0}, "STARTUP_SOURCE_PROBE_POLL_INTERVAL_MS"),
        ({"processed_video_fps": 0}, "PROCESSED_VIDEO_FPS"),
        ({"processed_video_analysis_fps": -1}, "PROCESSED_VIDEO_ANALYSIS_FPS"),
        ({"processed_video_status_update_every_frames": 0}, "PROCESSED_VIDEO_STATUS_UPDATE_EVERY_FRAMES"),
        ({"processed_video_max_width": -1}, "PROCESSED_VIDEO_MAX_WIDTH"),
        ({"processed_video_max_seconds": -1}, "PROCESSED_VIDEO_MAX_SECONDS"),
        ({"processed_video_fourcc": "bad"}, "PROCESSED_VIDEO_FOURCC"),
        ({"min_quality_score": -0.1}, "MIN_QUALITY_SCORE"),
        ({"max_occlusion_ratio": 1.1}, "MAX_OCCLUSION_RATIO"),
        ({"crop_border_px": -1}, "CROP_BORDER_PX"),
        ({"min_bbox_area_ratio": 0}, "MIN_BBOX_AREA_RATIO"),
        ({"min_bbox_height_px": 0}, "MIN_BBOX_HEIGHT_PX"),
        ({"tracker_iou_threshold": 1.5}, "TRACKER_IOU_THRESHOLD"),
        ({"tracker_max_age_frames": 0}, "TRACKER_MAX_AGE_FRAMES"),
        ({"tracker_min_hits": 0}, "TRACKER_MIN_HITS"),
        ({"tracker_match_threshold": -0.1}, "TRACKER_MATCH_THRESHOLD"),
        ({"day_person_match_threshold": 2.0}, "DAY_PERSON_MATCH_THRESHOLD"),
        ({"day_person_match_margin": -0.1}, "DAY_PERSON_MATCH_MARGIN"),
        ({"day_person_min_stable_hits": 0}, "DAY_PERSON_MIN_STABLE_HITS"),
        ({"identity_tentative_min_valid_hits": 0}, "IDENTITY_TENTATIVE_MIN_VALID_HITS"),
        ({"identity_confirm_min_valid_hits": 2, "identity_tentative_min_valid_hits": 3}, "IDENTITY_CONFIRM_MIN_VALID_HITS"),
        ({"identity_body_only_match_threshold": -0.1}, "IDENTITY_BODY_ONLY_MATCH_THRESHOLD"),
        ({"identity_body_only_match_margin": -0.1}, "IDENTITY_BODY_ONLY_MATCH_MARGIN"),
        ({"identity_reentry_body_match_threshold": 2.0}, "IDENTITY_REENTRY_BODY_MATCH_THRESHOLD"),
        ({"identity_reentry_body_match_margin": -0.1}, "IDENTITY_REENTRY_BODY_MATCH_MARGIN"),
        ({"identity_reentry_total_match_threshold": 2.0}, "IDENTITY_REENTRY_TOTAL_MATCH_THRESHOLD"),
        ({"identity_final_merge_body_threshold": 2.0}, "IDENTITY_FINAL_MERGE_BODY_THRESHOLD"),
        ({"identity_final_merge_body_margin": -0.1}, "IDENTITY_FINAL_MERGE_BODY_MARGIN"),
        ({"identity_face_match_threshold": 2.0}, "IDENTITY_FACE_MATCH_THRESHOLD"),
        ({"identity_existing_assignment_min_score": -0.1}, "IDENTITY_EXISTING_ASSIGNMENT_MIN_SCORE"),
        ({"identity_conflict_owner_margin": -0.1}, "IDENTITY_CONFLICT_OWNER_MARGIN"),
        ({"identity_max_track_gap_sec": -0.1}, "IDENTITY_MAX_TRACK_GAP_SEC"),
        ({"identity_handover_protection_sec": -0.1}, "IDENTITY_HANDOVER_PROTECTION_SEC"),
        ({"identity_occlusion_protection_sec": -0.1}, "IDENTITY_OCCLUSION_PROTECTION_SEC"),
        ({"identity_exit_candidate_sec": -0.1}, "IDENTITY_EXIT_CANDIDATE_SEC"),
        ({"identity_verified_reentry_min_sec": -0.1}, "IDENTITY_VERIFIED_REENTRY_MIN_SEC"),
        ({"identity_verified_reentry_min_sec": 5, "identity_verified_reentry_max_sec": 3}, "IDENTITY_VERIFIED_REENTRY_MAX_SEC"),
        ({"identity_max_motion_diagonals_per_sec": 0}, "IDENTITY_MAX_MOTION_DIAGONALS_PER_SEC"),
        ({"identity_short_stitch_max_gap_sec": -0.1}, "IDENTITY_SHORT_STITCH_MAX_GAP_SEC"),
        ({"person_detector_mode": "broken"}, "PERSON_DETECTOR_MODE"),
        ({"person_onnx_input_width": 0}, "PERSON_ONNX_INPUT_WIDTH"),
        ({"person_detector_box_format": "bad"}, "PERSON_DETECTOR_BOX_FORMAT"),
        ({"person_detector_has_objectness": "bad"}, "PERSON_DETECTOR_HAS_OBJECTNESS"),
        ({"person_detector_num_classes": -1}, "PERSON_DETECTOR_NUM_CLASSES"),
        ({"person_tracking_backend": "broken"}, "PERSON_TRACKING_BACKEND"),
        ({"person_tracking_min_confidence": 2.0}, "PERSON_TRACKING_MIN_CONFIDENCE"),
        ({"person_tracking_person_class_id": -1}, "PERSON_TRACKING_PERSON_CLASS_ID"),
        ({"person_tracking_backend": "development_simple", "person_tracking_require_external": True, "person_tracking_allow_dev_simple": True}, "PERSON_TRACKING_REQUIRE_EXTERNAL"),
        ({"person_tracking_backend": "development_simple", "person_tracking_require_external": False, "person_tracking_allow_dev_simple": False}, "PERSON_TRACKING_ALLOW_DEV_SIMPLE"),
        ({"person_class_ids": ("bad",)}, "PERSON_CLASS_IDS"),
        ({"person_class_ids": ("-1",)}, "PERSON_CLASS_IDS"),
        ({"headwear_detector_mode": "broken"}, "HEADWEAR_DETECTOR_MODE"),
        ({"headwear_input_width": 0}, "HEADWEAR_INPUT_WIDTH"),
        ({"headwear_classifier_conf_threshold": 2.0}, "HEADWEAR_CLASSIFIER_CONF_THRESHOLD"),
        ({"headwear_classifier_margin": -0.1}, "HEADWEAR_CLASSIFIER_MARGIN"),
        ({"headwear_detector_conf_threshold": -0.1}, "HEADWEAR_DETECTOR_CONF_THRESHOLD"),
        ({"headwear_detector_nms_iou": 2.0}, "HEADWEAR_DETECTOR_NMS_IOU"),
        ({"headwear_decision_margin": -0.1}, "HEADWEAR_DECISION_MARGIN"),
        ({"headwear_detector_box_format": "bad"}, "HEADWEAR_DETECTOR_BOX_FORMAT"),
        ({"headwear_detector_has_objectness": "bad"}, "HEADWEAR_DETECTOR_HAS_OBJECTNESS"),
        ({"headwear_detector_num_classes": -1}, "HEADWEAR_DETECTOR_NUM_CLASSES"),
        ({"headwear_input_normalization_mode": "bad"}, "HEADWEAR_INPUT_NORMALIZATION_MODE"),
        ({"headwear_classifier_binary_positive_means": "bad"}, "HEADWEAR_CLASSIFIER_BINARY_POSITIVE_MEANS"),
        ({"face_embedder_mode": "broken"}, "FACE_EMBEDDER_MODE"),
        ({"body_embedder_mode": "broken"}, "BODY_EMBEDDER_MODE"),
        ({"body_embedding_input_width": 0}, "BODY_EMBEDDING_INPUT_WIDTH"),
        ({"identity_max_day_people": 0}, "IDENTITY_MAX_DAY_PEOPLE"),
        ({"identity_embedding_gallery_size": 0}, "IDENTITY_EMBEDDING_GALLERY_SIZE"),
        ({"evidence_jpeg_quality": 0}, "EVIDENCE_JPEG_QUALITY"),
        ({"evidence_retention_days": 0}, "EVIDENCE_RETENTION_DAYS"),
        ({"evidence_cleanup_interval_sec": 0}, "EVIDENCE_CLEANUP_INTERVAL_SEC"),
        ({"backend_max_retries": -1}, "BACKEND_MAX_RETRIES"),
        ({"backend_retry_delay_sec": -0.1}, "BACKEND_RETRY_DELAY_SEC"),
        ({"backend_queue_maxsize": 0}, "BACKEND_QUEUE_MAXSIZE"),
        ({"backend_worker_poll_interval_ms": 0}, "BACKEND_WORKER_POLL_INTERVAL_MS"),
        ({"backend_enabled": True, "backend_base_url": ""}, "BACKEND_BASE_URL"),
        ({"backend_enabled": True, "backend_base_url": "http://backend", "backend_timeout_sec": 0}, "BACKEND_TIMEOUT_SEC"),
        ({"reid_face_weight": 0, "reid_body_weight": 0, "reid_position_weight": 0, "reid_time_weight": 0, "reid_size_weight": 0}, "REID_.*WEIGHT"),
        ({"reid_face_weight": -0.1}, "REID_FACE_WEIGHT"),
    ],
)
def test_runtime_static_config_validation_rejects_bad_values(kwargs: dict[str, object], expected_message: str) -> None:
    settings = _settings(**kwargs)

    with pytest.raises(ValueError, match=expected_message):
        settings.validate_runtime_static_config_or_raise()


@pytest.mark.parametrize(
    ("kwargs", "expected_message"),
    [
        ({"person_tracking_backend": "disabled"}, "PERSON_TRACKING_BACKEND"),
        ({"person_tracking_backend": "development_simple", "person_tracking_require_external": True, "person_tracking_allow_dev_simple": True}, "PERSON_TRACKING_REQUIRE_EXTERNAL"),
        ({"person_tracking_backend": "development_simple", "person_tracking_require_external": False, "person_tracking_allow_dev_simple": False}, "PERSON_TRACKING_ALLOW_DEV_SIMPLE"),
        ({"person_tracking_backend": "ultralytics", "yolo_model_path": ""}, "PERSON_MODEL_PATH"),
        ({"person_tracking_backend": "ultralytics", "yolo_model_path": "missing.pt", "person_allow_ultralytics_auto_download": False}, "does not exist"),
        ({"person_tracking_backend": "disabled", "headwear_detector_mode": "onnx_classifier", "headwear_model_path": ""}, "HEADWEAR_MODEL_PATH"),
        ({"person_tracking_backend": "disabled", "body_embedder_mode": "onnx", "body_embedder_strict_backend": True, "body_embedding_model_path": ""}, "BODY_EMBEDDING_MODEL_PATH"),
    ],
)
def test_runtime_launch_validation_rejects_unsafe_runtime_combinations(kwargs: dict[str, object], expected_message: str) -> None:
    settings = _settings(**kwargs)

    with pytest.raises(ValueError, match=expected_message):
        settings.validate_runtime_launch_or_raise(source_url="rtsp://camera", require_real_headwear=True)


def test_runtime_launch_validation_rejects_empty_source_url_with_otherwise_safe_dev_backend() -> None:
    settings = _settings(
        person_tracking_backend="development_simple",
        person_tracking_require_external=False,
        person_tracking_allow_dev_simple=True,
        headwear_detector_mode="placeholder",
        runtime_require_real_headwear=False,
    )

    with pytest.raises(ValueError, match="SOURCE_URL"):
        settings.validate_runtime_launch_or_raise(source_url="", require_real_headwear=False)


def test_runtime_launch_validation_allows_dev_simple_only_when_explicitly_safe(tmp_path: Path) -> None:
    headwear = tmp_path / "headwear.onnx"
    headwear.write_bytes(b"placeholder")
    settings = _settings(
        person_tracking_backend="development_simple",
        person_tracking_require_external=False,
        person_tracking_allow_dev_simple=True,
        headwear_detector_mode="placeholder",
        runtime_require_real_headwear=False,
    )

    settings.validate_runtime_launch_or_raise(source_url="file.mp4", require_real_headwear=False)
