from __future__ import annotations

import argparse
import shutil
from pathlib import Path

import pandas as pd
from ultralytics import YOLO


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--best-pt", required=True)
    parser.add_argument("--test-root", required=True)
    parser.add_argument("--audit-root", required=True)
    args = parser.parse_args()

    best_pt = Path(args.best_pt)
    test_root = Path(args.test_root)
    audit_root = Path(args.audit_root)

    model = YOLO(str(best_pt))
    rows = []
    image_exts = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

    for true_dir in sorted([p for p in test_root.iterdir() if p.is_dir()]):
        true_label = true_dir.name

        for img_path in sorted(true_dir.rglob("*")):
            if img_path.suffix.lower() not in image_exts:
                continue

            result = model.predict(
                source=str(img_path),
                imgsz=224,
                device="cpu",
                verbose=False,
            )[0]

            top1 = int(result.probs.top1)
            conf = float(result.probs.top1conf)
            pred_label = str(result.names[top1])
            is_correct = pred_label == true_label

            if is_correct:
                bucket = "correct"
            elif true_label == "fragment_or_negative" and pred_label == "person_trackable":
                bucket = "danger_false_pass"
            elif true_label == "person_trackable" and pred_label == "fragment_or_negative":
                bucket = "false_block"
            else:
                bucket = "other_error"

            if conf < 0.75:
                confidence_group = "low"
            elif conf < 0.90:
                confidence_group = "mid"
            else:
                confidence_group = "high"

            row_id = len(rows)

            rows.append({
                "row_id": row_id,
                "image_path": str(img_path),
                "true_label": true_label,
                "pred_label": pred_label,
                "confidence": round(conf, 6),
                "is_correct": int(is_correct),
                "bucket": bucket,
                "confidence_group": confidence_group,
            })

            if bucket != "correct":
                dst_dir = audit_root / bucket / confidence_group
                dst_dir.mkdir(parents=True, exist_ok=True)
                dst_name = f"{row_id:06d}__{conf:.3f}.jpg"
                shutil.copy2(img_path, dst_dir / dst_name)

    audit_root.mkdir(parents=True, exist_ok=True)

    df = pd.DataFrame(rows)
    df.to_csv(audit_root / "predictions.csv", sep=";", index=False, encoding="utf-8-sig")

    summary = (
        df.groupby(["bucket", "confidence_group"])
        .size()
        .reset_index(name="count")
        .sort_values(["bucket", "confidence_group"])
    )
    summary.to_csv(audit_root / "summary.csv", sep=";", index=False, encoding="utf-8-sig")

    print("DONE")
    print("audit_root=", audit_root)
    print()
    print("SUMMARY")
    print(summary.to_string(index=False))
    print()
    print("TOTAL")
    print(df.groupby(["true_label", "pred_label"]).size().reset_index(name="count").to_string(index=False))


if __name__ == "__main__":
    main()
