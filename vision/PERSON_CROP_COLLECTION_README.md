# Person crop collection mode

Реализован временный режим для тихого сбора датасета из большого видео.

Что делает режим:

```text
video -> frame sampling -> Ultralytics person detection only -> PersonBoxGate -> clean frame + clean person crop + manifest.csv
```

Что намеренно НЕ запускается:

```text
tracking / BoT-SORT / ByteTrack
headwear classifier
quality gate для головного убора
incident engine
frame evidence store
overlay drawing
VideoWriter / export-video файл
```

## Новые настройки .env

```env
PERSON_CROP_COLLECTION_ENABLED=true
PERSON_CROP_COLLECTION_DIR=./data/person_crop_collection
PERSON_CROP_COLLECTION_FPS=1
PERSON_CROP_COLLECTION_MAX_WIDTH=0
PERSON_CROP_COLLECTION_MAX_SAMPLES=0
PERSON_CROP_COLLECTION_SAVE_FRAMES=true
PERSON_CROP_COLLECTION_SAVE_REJECTED=false
PERSON_CROP_COLLECTION_JPEG_QUALITY=92
```

`PERSON_CROP_COLLECTION_MAX_WIDTH=0` означает: не ресайзить кадр перед детекцией и сохранением.

## Запуск через существующий export endpoint

Если `PERSON_CROP_COLLECTION_ENABLED=true`, обычный `/runtime/export-video` автоматически работает как сбор person crops и не пишет видео.

```powershell
python .\run_runtime.py --source-url "D:\path\video.mp4" --max-seconds 60
```

## Явный запуск через новый endpoint

```powershell
python .\run_runtime.py `
  --collect-person-crops `
  --source-url "D:\path\video.mp4" `
  --output-dir "D:\person_crop_dataset" `
  --max-seconds 60
```

Или HTTP:

```text
POST /runtime/collect-person-crops?source_url=...&output_dir=...&max_seconds=...
```

## Результат

```text
PERSON_CROP_COLLECTION_DIR/
  camera-id/
    YYYYMMDD_HHMMSS_person_crops/
      frames/
      crops/
        accepted/
        rejected/     # только если PERSON_CROP_COLLECTION_SAVE_REJECTED=true
      manifest.csv
      summary.csv
```

`manifest.csv` содержит bbox, confidence, размеры, blur, brightness, reason_codes, пути к frame/crop.

## Adaptive sampling

Для большого архива можно не анализировать фиксированный FPS, а переключать частоту:

```env
PERSON_CROP_COLLECTION_ADAPTIVE_SAMPLING=true
PERSON_CROP_COLLECTION_IDLE_FPS=0.2
PERSON_CROP_COLLECTION_ACTIVE_FPS=2
PERSON_CROP_COLLECTION_ACTIVE_HOLD_SECONDS=10
```

Логика: пустая сцена анализируется раз в 5 секунд, при появлении любого person detection режим переходит на 2 кадра/сек и удерживается ещё 10 секунд после последнего обнаружения.
