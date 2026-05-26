# ============================================================
# File: vision/tools/dataset/build_stage05_auto_verification.py
# Purpose:
# - Auto-verify Stage04 annotation exports without manual labeling.
# - Build confidence layers instead of treating old detector outputs as truth.
# - Person proposals:
#   gold / silver / pending / fragment_or_negative.
# - Head crops:
#   gold face-based head pseudo-labels / silver geometry candidates /
#   no_actionable_head_gold / pending.
# - Does not train models and does not modify raw collections.
# ============================================================

from __future__ import annotations

import argparse
import math
from pathlib import Path

import cv2
import numpy as np
import pandas as pd


DEFAULT_FRAME_WIDTH = 1920
DEFAULT_FRAME_HEIGHT = 1080


def _read_csv(path: Path) -> pd.DataFrame:
    if not path.exists():
        raise FileNotFoundError(f"CSV not found: {path}")
    return pd.read_csv(path, sep=";", dtype=str, keep_default_na=False).fillna("")


def _to_float(value: object, default: float = 0.0) -> float:
    try:
        text = str(value).strip().replace(",", ".")
        if not text:
            return default
        return float(text)
    except Exception:
        return default


def _to_int(value: object, default: int = 0) -> int:
    try:
        return int(round(_to_float(value, float(default))))
    except Exception:
        return default


def _clip(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _read_image(path: str) -> np.ndarray | None:
    if not path:
        return None
    p = Path(path)
    if not p.exists():
        return None
    try:
        return cv2.imread(str(p), cv2.IMREAD_COLOR)
    except cv2.error:
        return None


def _image_stats(image: np.ndarray | None) -> tuple[float, float, float]:
    if image is None or image.size == 0:
        return 0.0, 0.0, 0.0

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    brightness = float(np.mean(gray))
    contrast = float(np.std(gray))
    blur = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    return round(brightness, 4), round(contrast, 4), round(blur, 4)


def _crop_box(image: np.ndarray, x1: int, y1: int, x2: int, y2: int) -> np.ndarray | None:
    h, w = image.shape[:2]
    x1 = max(0, min(w - 1, int(x1)))
    y1 = max(0, min(h - 1, int(y1)))
    x2 = max(0, min(w, int(x2)))
    y2 = max(0, min(h, int(y2)))

    if x2 <= x1 or y2 <= y1:
        return None

    return image[y1:y2, x1:x2].copy()


def _load_face_cascades() -> list[cv2.CascadeClassifier]:
    cascade_names = [
        "haarcascade_frontalface_default.xml",
        "haarcascade_frontalface_alt.xml",
        "haarcascade_profileface.xml",
    ]

    cascades: list[cv2.CascadeClassifier] = []

    for name in cascade_names:
        path = Path(cv2.data.haarcascades) / name
        if not path.exists():
            continue
        cascade = cv2.CascadeClassifier(str(path))
        if not cascade.empty():
            cascades.append(cascade)

    return cascades


def _detect_faces(image: np.ndarray, cascades: list[cv2.CascadeClassifier]) -> list[tuple[int, int, int, int, float]]:
    if image is None or image.size == 0 or not cascades:
        return []

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    # Upscale tiny crops a little for Haar stability.
    h, w = gray.shape[:2]
    scale = 1.0
    if min(h, w) < 160:
        scale = 2.0
        gray_for_det = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
    else:
        gray_for_det = gray

    detections: list[tuple[int, int, int, int, float]] = []

    for cascade in cascades:
        rects = cascade.detectMultiScale(
            gray_for_det,
            scaleFactor=1.08,
            minNeighbors=4,
            minSize=(24, 24),
            flags=cv2.CASCADE_SCALE_IMAGE,
        )

        for x, y, fw, fh in rects:
            x = int(round(x / scale))
            y = int(round(y / scale))
            fw = int(round(fw / scale))
            fh = int(round(fh / scale))

            if fw <= 0 or fh <= 0:
                continue

            area_ratio = (fw * fh) / max(1, w * h)
            if area_ratio < 0.002 or area_ratio > 0.40:
                continue

            score = _clip(area_ratio * 15.0, 0.1, 1.0)
            detections.append((x, y, x + fw, y + fh, score))

    detections.sort(key=lambda r: r[4], reverse=True)
    return detections


def _expand_face_to_head(face: tuple[int, int, int, int, float], image_w: int, image_h: int) -> tuple[int, int, int, int]:
    x1, y1, x2, y2, _ = face
    fw = x2 - x1
    fh = y2 - y1

    hx1 = int(round(x1 - 0.30 * fw))
    hy1 = int(round(y1 - 0.55 * fh))
    hx2 = int(round(x2 + 0.30 * fw))
    hy2 = int(round(y2 + 0.30 * fh))

    hx1 = max(0, min(image_w - 1, hx1))
    hy1 = max(0, min(image_h - 1, hy1))
    hx2 = max(1, min(image_w, hx2))
    hy2 = max(1, min(image_h, hy2))

    if hx2 <= hx1:
        hx2 = min(image_w, hx1 + 1)
    if hy2 <= hy1:
        hy2 = min(image_h, hy1 + 1)

    return hx1, hy1, hx2, hy2


def _geometry_head_candidate(image_w: int, image_h: int) -> tuple[int, int, int, int]:
    # Weak candidate only. It is never gold by itself.
    head_w = int(round(image_w * 0.58))
    head_h = int(round(image_h * 0.34))
    x1 = int(round((image_w - head_w) / 2.0))
    y1 = 0
    x2 = x1 + head_w
    y2 = head_h

    x1 = max(0, min(image_w - 1, x1))
    y1 = max(0, min(image_h - 1, y1))
    x2 = max(1, min(image_w, x2))
    y2 = max(1, min(image_h, y2))

    return x1, y1, x2, y2


def _yolo_bbox_from_xyxy(x1: int, y1: int, x2: int, y2: int, image_w: int, image_h: int) -> str:
    xc = ((x1 + x2) / 2.0) / max(1, image_w)
    yc = ((y1 + y2) / 2.0) / max(1, image_h)
    bw = (x2 - x1) / max(1, image_w)
    bh = (y2 - y1) / max(1, image_h)
    return f"0 {xc:.6f} {yc:.6f} {bw:.6f} {bh:.6f}"


def _score_person_proposals(boxes: pd.DataFrame, output_dir: Path, progress_every: int = 1000) -> pd.DataFrame:
    rows = []

    for idx, row in boxes.reset_index(drop=True).iterrows():
        frame_path = str(row.get("export_image_path", "")).strip()
        if not frame_path:
            frame_path = str(row.get("absolute_frame_path", "")).strip()

        # Do not cache full frames here: 1920x1080 image is about 6 MB,
        # and thousands of cached frames quickly exhaust RAM.
        frame = _read_image(frame_path)

        frame_h = DEFAULT_FRAME_HEIGHT
        frame_w = DEFAULT_FRAME_WIDTH

        if frame is not None:
            frame_h, frame_w = frame.shape[:2]

        x1 = _to_int(row.get("bbox_x1", 0))
        y1 = _to_int(row.get("bbox_y1", 0))
        x2 = _to_int(row.get("bbox_x2", 0))
        y2 = _to_int(row.get("bbox_y2", 0))

        bw = max(1, x2 - x1)
        bh = max(1, y2 - y1)

        aspect = bw / max(1, bh)
        area_ratio = (bw * bh) / max(1, frame_w * frame_h)
        height_ratio = bh / max(1, frame_h)
        width_ratio = bw / max(1, frame_w)

        conf = _to_float(row.get("person_conf", 0))
        stage_bucket = str(row.get("stage03_frame_bucket", ""))
        review_role = str(row.get("person_detector_review_role", ""))

        left_edge = x1 <= frame_w * 0.02
        right_edge = x2 >= frame_w * 0.98
        top_edge = y1 <= frame_h * 0.02
        bottom_edge = y2 >= frame_h * 0.98

        crop = None
        if frame is not None:
            crop = _crop_box(frame, x1, y1, x2, y2)

        brightness, contrast, blur = _image_stats(crop)

        geometry_ok = (
            0.32 <= aspect <= 1.15
            and 0.015 <= area_ratio <= 0.36
            and height_ratio >= 0.18
            and width_ratio >= 0.035
        )

        severe_bad_aspect = aspect < 0.26 or aspect > 1.55
        too_tiny = area_ratio < 0.008 or height_ratio < 0.12
        bad_quality = blur < 8.0 or brightness < 15.0 or brightness > 245.0

        bottom_entry_ok = (
            bottom_edge
            and not top_edge
            and 0.28 <= aspect <= 1.25
            and height_ratio >= 0.18
            and area_ratio >= 0.012
        )

        edge_allowed = bottom_entry_ok
        severe_edge = (left_edge or right_edge or top_edge) and not edge_allowed

        explicit_fragment_hint = (
            "fragment" in stage_bucket
            or "fragment" in review_role
            or severe_bad_aspect
            or too_tiny
        )

        score = 0.0
        score += 0.38 * _clip((conf - 0.60) / 0.40, 0.0, 1.0)
        score += 0.25 if geometry_ok else 0.0
        score += 0.15 if not severe_edge else 0.0
        score += 0.10 if not bad_quality else 0.0
        score += 0.12 if bottom_entry_ok else 0.0

        if explicit_fragment_hint:
            score -= 0.45

        score = round(_clip(score, 0.0, 1.0), 6)

        if explicit_fragment_hint and score < 0.55:
            verdict = "fragment_or_negative"
        elif conf >= 0.90 and geometry_ok and not severe_edge and not explicit_fragment_hint and not bad_quality:
            verdict = "person_gold_full_or_clear"
        elif conf >= 0.86 and bottom_entry_ok and not explicit_fragment_hint and not bad_quality:
            verdict = "person_gold_bottom_entry"
        elif score >= 0.68 and not explicit_fragment_hint:
            verdict = "person_silver"
        else:
            verdict = "person_pending"

        out = row.to_dict()
        out.update({
            "auto_person_score": score,
            "auto_person_verdict": verdict,
            "auto_geometry_ok": int(geometry_ok),
            "auto_bottom_entry_ok": int(bottom_entry_ok),
            "auto_explicit_fragment_hint": int(explicit_fragment_hint),
            "auto_severe_edge": int(severe_edge),
            "auto_bad_quality": int(bad_quality),
            "auto_bbox_aspect": round(aspect, 6),
            "auto_bbox_area_ratio": round(area_ratio, 8),
            "auto_bbox_height_ratio": round(height_ratio, 6),
            "auto_crop_brightness": brightness,
            "auto_crop_contrast": contrast,
            "auto_crop_blur": blur,
            "auto_train_policy": (
                "use_as_positive" if verdict.startswith("person_gold")
                else "candidate_second_cycle" if verdict == "person_silver"
                else "use_as_empty_or_ignore" if verdict == "fragment_or_negative"
                else "do_not_train"
            ),
        })

        rows.append(out)

        if (idx + 1) % progress_every == 0:
            print(f"[person gate] {idx + 1}/{len(boxes)}")

    scored = pd.DataFrame(rows)

    scored.to_csv(output_dir / "person_gate_scores.csv", sep=";", index=False, encoding="utf-8-sig")

    for name, part in [
        ("person_gate_gold.csv", scored[scored["auto_person_verdict"].astype(str).str.startswith("person_gold")]),
        ("person_gate_silver.csv", scored[scored["auto_person_verdict"] == "person_silver"]),
        ("person_gate_fragment_or_negative.csv", scored[scored["auto_person_verdict"] == "fragment_or_negative"]),
        ("person_gate_pending.csv", scored[scored["auto_person_verdict"] == "person_pending"]),
    ]:
        part.to_csv(output_dir / name, sep=";", index=False, encoding="utf-8-sig")

    return scored


def _score_head_crops(crops: pd.DataFrame, output_dir: Path, progress_every: int = 1000) -> pd.DataFrame:
    cascades = _load_face_cascades()

    if not cascades:
        print("[head pseudo] warning: no OpenCV Haar cascades found, face-based gold will be unavailable")

    rows = []

    for idx, row in crops.reset_index(drop=True).iterrows():
        image_path = str(row.get("export_image_path", "")).strip()
        if not image_path:
            image_path = str(row.get("absolute_crop_path", "")).strip()

        image = _read_image(image_path)

        if image is None:
            out = row.to_dict()
            out.update({
                "auto_head_verdict": "head_pending",
                "auto_head_score": 0.0,
                "auto_head_source": "image_missing",
                "head_bbox_x1": "",
                "head_bbox_y1": "",
                "head_bbox_x2": "",
                "head_bbox_y2": "",
                "yolo_head_label": "",
                "auto_head_policy": "do_not_train",
            })
            rows.append(out)
            continue

        image_h, image_w = image.shape[:2]
        brightness, contrast, blur = _image_stats(image)

        stage_bucket = str(row.get("stage03_bucket", ""))
        person_conf = _to_float(row.get("person_conf", 0))

        faces = _detect_faces(image, cascades)
        face_found = len(faces) > 0

        head_bbox = None
        head_source = "none"
        face_score = 0.0

        if face_found:
            best_face = faces[0]
            face_score = float(best_face[4])
            head_bbox = _expand_face_to_head(best_face, image_w, image_h)
            head_source = "haar_face_expanded"

        geometry_bbox = _geometry_head_candidate(image_w, image_h)

        quality_ok = (
            image_w >= 48
            and image_h >= 80
            and blur >= 10.0
            and 18.0 <= brightness <= 245.0
            and contrast >= 8.0
        )

        plausible_person_crop = (
            image_h >= 90
            and image_w >= 45
            and 0.20 <= (image_w / max(1, image_h)) <= 1.60
        )

        no_head_hint = (
            "no_actionable" in stage_bucket
            or "fragment" in stage_bucket
        )

        edge_or_bottom = (
            "bottom" in stage_bucket
            or "edge" in stage_bucket
        )

        score = 0.0
        score += 0.45 if face_found else 0.0
        score += 0.18 if quality_ok else 0.0
        score += 0.16 if plausible_person_crop else 0.0
        score += 0.10 * _clip((person_conf - 0.65) / 0.35, 0.0, 1.0)
        score += 0.08 if edge_or_bottom else 0.0
        score -= 0.35 if no_head_hint else 0.0

        score = round(_clip(score, 0.0, 1.0), 6)

        if face_found and quality_ok and plausible_person_crop and not no_head_hint:
            verdict = "head_gold_face_based"
            final_bbox = head_bbox
            final_source = head_source
            policy = "use_as_head_positive"
        elif no_head_hint and not face_found:
            verdict = "no_actionable_head_gold"
            final_bbox = None
            final_source = "negative_bucket_no_face"
            policy = "use_as_empty_label"
        elif quality_ok and plausible_person_crop and not no_head_hint:
            verdict = "head_silver_geometry"
            final_bbox = geometry_bbox
            final_source = "geometry_weak_candidate"
            policy = "candidate_second_cycle_not_gold"
        else:
            verdict = "head_pending"
            final_bbox = None
            final_source = "uncertain"
            policy = "do_not_train"

        if final_bbox is not None:
            x1, y1, x2, y2 = final_bbox
            yolo = _yolo_bbox_from_xyxy(x1, y1, x2, y2, image_w, image_h)
        else:
            x1 = y1 = x2 = y2 = ""
            yolo = ""

        out = row.to_dict()
        out.update({
            "auto_head_score": score,
            "auto_head_verdict": verdict,
            "auto_head_source": final_source,
            "auto_face_found": int(face_found),
            "auto_face_score": round(face_score, 6),
            "auto_head_quality_ok": int(quality_ok),
            "auto_plausible_person_crop": int(plausible_person_crop),
            "auto_no_head_hint": int(no_head_hint),
            "crop_image_width": image_w,
            "crop_image_height": image_h,
            "crop_brightness": brightness,
            "crop_contrast": contrast,
            "crop_blur": blur,
            "head_bbox_x1": x1,
            "head_bbox_y1": y1,
            "head_bbox_x2": x2,
            "head_bbox_y2": y2,
            "yolo_head_label": yolo,
            "auto_head_policy": policy,
        })

        rows.append(out)

        if (idx + 1) % progress_every == 0:
            print(f"[head pseudo] {idx + 1}/{len(crops)}")

    scored = pd.DataFrame(rows)

    scored.to_csv(output_dir / "head_pseudo_scores.csv", sep=";", index=False, encoding="utf-8-sig")

    for name, part in [
        ("head_pseudo_gold_face_based.csv", scored[scored["auto_head_verdict"] == "head_gold_face_based"]),
        ("head_pseudo_silver_geometry.csv", scored[scored["auto_head_verdict"] == "head_silver_geometry"]),
        ("head_no_actionable_gold.csv", scored[scored["auto_head_verdict"] == "no_actionable_head_gold"]),
        ("head_pending.csv", scored[scored["auto_head_verdict"] == "head_pending"]),
    ]:
        part.to_csv(output_dir / name, sep=";", index=False, encoding="utf-8-sig")

    return scored


def _write_summary(output_root: Path, person: pd.DataFrame, head: pd.DataFrame) -> None:
    rows = [
        ("person_total_proposals", len(person)),
        ("person_gold_total", int(person["auto_person_verdict"].astype(str).str.startswith("person_gold").sum())),
        ("person_silver_total", int((person["auto_person_verdict"] == "person_silver").sum())),
        ("person_fragment_or_negative_total", int((person["auto_person_verdict"] == "fragment_or_negative").sum())),
        ("person_pending_total", int((person["auto_person_verdict"] == "person_pending").sum())),
        ("head_total_crops", len(head)),
        ("head_gold_face_based_total", int((head["auto_head_verdict"] == "head_gold_face_based").sum())),
        ("head_silver_geometry_total", int((head["auto_head_verdict"] == "head_silver_geometry").sum())),
        ("head_no_actionable_gold_total", int((head["auto_head_verdict"] == "no_actionable_head_gold").sum())),
        ("head_pending_total", int((head["auto_head_verdict"] == "head_pending").sum())),
    ]

    for verdict, count in person["auto_person_verdict"].value_counts().sort_index().items():
        rows.append((f"person_verdict_{verdict}", int(count)))

    for verdict, count in head["auto_head_verdict"].value_counts().sort_index().items():
        rows.append((f"head_verdict_{verdict}", int(count)))

    pd.DataFrame(rows, columns=["metric", "value"]).to_csv(
        output_root / "stage05_summary.csv",
        sep=";",
        index=False,
        encoding="utf-8-sig",
    )


def build(args: argparse.Namespace) -> None:
    stage04_root = Path(args.stage04_root)
    output_root = Path(args.output_root)

    person_root = output_root / "person_proposal_gate"
    head_root = output_root / "head_pseudo_labels"

    person_root.mkdir(parents=True, exist_ok=True)
    head_root.mkdir(parents=True, exist_ok=True)

    person_boxes_path = (
        stage04_root
        / "person_detector_refinement_v1"
        / "metadata"
        / "detector_proposal_boxes_for_selected_frames_export.csv"
    )

    head_crops_path = (
        stage04_root
        / "head_detector_v1"
        / "metadata"
        / "person_crops_to_annotate_export.csv"
    )

    print("[stage05] reading person proposal boxes")
    person_boxes = _read_csv(person_boxes_path)

    print("[stage05] scoring person proposals")
    person_scored = _score_person_proposals(person_boxes, person_root, progress_every=args.progress_every)

    print("[stage05] reading head crops")
    head_crops = _read_csv(head_crops_path)

    print("[stage05] scoring head pseudo labels")
    head_scored = _score_head_crops(head_crops, head_root, progress_every=args.progress_every)

    print("[stage05] writing summary")
    _write_summary(output_root, person_scored, head_scored)

    print()
    print("DONE")
    print(f"output_root={output_root}")
    print(f"summary={output_root / 'stage05_summary.csv'}")
    print(f"person_scores={person_root / 'person_gate_scores.csv'}")
    print(f"head_scores={head_root / 'head_pseudo_scores.csv'}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--stage04-root", required=True)
    parser.add_argument("--output-root", required=True)
    parser.add_argument("--progress-every", type=int, default=1000)
    return parser.parse_args()


if __name__ == "__main__":
    build(parse_args())
