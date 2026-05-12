# ============================================================
# File: vision/trim_video_1min.py
# Purpose:
# - Cuts the first 60 seconds from a test video without ffmpeg.
# - Uses OpenCV VideoCapture / VideoWriter.
# - Audio is not preserved, which is fine for vision runtime tests.
# ============================================================

from __future__ import annotations

from pathlib import Path

import cv2


INPUT_PATH = Path("data/input/ct5_fragment_05-20_07-20.mp4")
OUTPUT_PATH = Path("data/input/ct5_fragment_05-20_07-20_1min.mp4")
DURATION_SECONDS = 60.0


def main() -> None:
    if not INPUT_PATH.exists():
        raise FileNotFoundError(f"Input video not found: {INPUT_PATH}")

    capture = cv2.VideoCapture(str(INPUT_PATH))
    if not capture.isOpened():
        raise RuntimeError(f"Failed to open input video: {INPUT_PATH}")

    try:
        fps = float(capture.get(cv2.CAP_PROP_FPS) or 0.0)
        frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
        height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)

        if fps <= 0:
            fps = 7.0

        if width <= 0 or height <= 0:
            raise RuntimeError("Invalid video size")

        max_frames = int(round(fps * DURATION_SECONDS))
        if frame_count > 0:
            max_frames = min(max_frames, frame_count)

        OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)

        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(
            str(OUTPUT_PATH),
            fourcc,
            fps,
            (width, height),
        )

        if not writer.isOpened():
            raise RuntimeError(f"Failed to create output video: {OUTPUT_PATH}")

        written = 0

        try:
            while written < max_frames:
                ok, frame = capture.read()
                if not ok or frame is None:
                    break

                writer.write(frame)
                written += 1
        finally:
            writer.release()

        print("OK")
        print(f"Input:  {INPUT_PATH}")
        print(f"Output: {OUTPUT_PATH}")
        print(f"FPS:    {fps:.3f}")
        print(f"Frames: {written}")
        print(f"Sec:    {written / fps:.2f}")

    finally:
        capture.release()


if __name__ == "__main__":
    main()