# HEADWEAR_DO_THIS_NOW

## Назначение

Практический чек-лист для перехода от диагностической проверки модели санитарного головного убора к рабочему offline runtime.

Текущий runtime обрабатывает заранее скачанные видео. Основной поток:

```text
video file -> PersonTrackingEngine -> TrackEpisodeRegistry -> QualityGate
-> TrackObservation -> HeadwearDetector -> IncidentEngine -> FrameStore/API
```

Классификатор/детектор головного убора должен получать **ROI головы** из `TrackObservation.head_bbox`, а не полный кадр и не произвольный bbox человека.

---

## 0. Рабочая папка

Открыть PowerShell в папке `vision`:

```powershell
cd "C:\Users\Goman Nikita\Desktop\safety-control-admin-panel\vision"

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0
$ProgressPreference = "SilentlyContinue"
```

Активировать окружение:

```powershell
.\.venv\Scripts\Activate.ps1
```

---

## 1. Единый рабочий env

Рабочим runtime-конфигом считается **только `.env` в корне папки `vision`**.

Не поддерживать несколько равноправных рабочих env-файлов. Если нужны примеры режимов, хранить их как `.env.example` или `config/env/*.example`, но фактический запуск должен читать один корневой `.env`.

Нормально для текущей временной модели:

```text
HEADWEAR_MODEL_POLICY=diagnostic_only
HEADWEAR_INCIDENTS_ENABLED=false
HEADWEAR_DEBUG_SAVE_CROPS=true
```

В этом режиме runtime проверяет ROI, сохраняет debug crop-ы и логирует inference, но не открывает события нарушения.

Когда модель проверена на реальных данных и готова формировать события:

```text
HEADWEAR_MODEL_POLICY=production
HEADWEAR_INCIDENTS_ENABLED=true
HEADWEAR_DEBUG_SAVE_CROPS=false
```

Значение `HEADWEAR_MODEL_POLICY=enforce` не используется. Допустимые значения: `diagnostic_only`, `production`, `disabled`.

---

## 2. Проверить чистоту проекта

Перед модельными работами:

```powershell
python -m ruff check app run_runtime.py check_video_runtime.py tools
python -m vulture app --min-confidence 70
python tools\check_requirements.py
python -m compileall -q app run_runtime.py check_video_runtime.py tools
```

Нормально:

```text
ruff: All checks passed
vulture: no output
compileall: no output
check_requirements: no errors
```

Warnings по отсутствующим recommended tests допустимы, если этап тестов еще не выполняется.

---

## 3. Получить реальные crops из видео

Цель — собрать материал, похожий на runtime ROI.

Сначала скан:

```powershell
.\scripts\headwear\09_scan_video_people.ps1 `
  -Video "C:\path\to\video.mp4" `
  -PersonModel "C:\path\to\person_model.pt" `
  -Device "cpu" `
  -SampleSeconds 2 `
  -PersonConf 0.20
```

Затем извлечение:

```powershell
.\scripts\headwear\10_extract_crops_from_video.ps1 `
  -Video "C:\path\to\video.mp4" `
  -PersonModel "C:\path\to\person_model.pt" `
  -Device "cpu" `
  -SampleSeconds 2 `
  -PersonConf 0.20 `
  -MaxCrops 20000 `
  -SaveFrameContext
```

Проверить, что появились:

```text
metadata.csv
crops
input previews
frame context, если включен SaveFrameContext
```

---

## 4. Отфильтровать очевидный мусор

```powershell
.\scripts\headwear\13_filter_mined_crops_quality.ps1
```

Не удалять все плохие ROI. Часть плохих ROI нужна как `unknown_unusable`.

---

## 5. Сделать sheets для разметки

```powershell
.\scripts\headwear\14_make_sheet_labeling_batches.ps1
```

Размечать классы:

```text
allowed_sanitary_headwear
non_sanitary_headwear
unknown_unusable
```

Правила:

- если санитарный головной убор виден надежно — `allowed_sanitary_headwear`;
- если надежно видно отсутствие/нарушение — `non_sanitary_headwear`;
- если голова не видна, ROI плохой, crop размыт/темный/перекрыт — `unknown_unusable`;
- сомнение — `unknown_unusable`.

---

## 6. Применить labels

```powershell
.\scripts\headwear\15_apply_sheet_labels.ps1
```

Проверить:

```text
class_counts.csv
metadata.csv с final_class
папки классов
```

---

## 7. Подготовить датасет

```powershell
.\scripts\headwear\02_prepare_dataset.ps1
```

Ожидаемая структура:

```text
datasets/headwear_policy_v1/
  train/
  val/
  test_real/
```

Проверить, что `test_real` не состоит из дублей train.

---

## 8. Обучить модель

```powershell
.\scripts\headwear\03_train_classifier.ps1
```

После обучения сохранить:

- веса модели;
- class order;
- training config;
- metrics;
- confusion matrix;
- примеры ошибок.

---

## 9. Экспортировать ONNX

```powershell
.\scripts\headwear\04_export_onnx.ps1
```

Зафиксировать:

```text
input_width
input_height
normalization_mode
class_names
output_shape
```

---

## 10. Проверить ONNX на реальных debug crops

```powershell
.\scripts\headwear\06_verify_onnx_on_debug_crops.ps1
```

Проверить руками несколько групп:

- уверенные allowed;
- уверенные violation;
- плохие ROI;
- темные кадры;
- размытые кадры;
- перекрытия;
- поворот головы.

Плохие ROI должны уходить в `UNKNOWN`, а не в `VIOLATION`.

---

## 11. Оценить test_real

```powershell
.\scripts\headwear\05_evaluate_real_test.ps1
```

Смотреть:

- accuracy;
- macro-F1;
- confusion matrix;
- precision/recall по `non_sanitary_headwear`;
- сколько плохих ROI ошибочно ушло в violation.

---

## 12. Переключить runtime на новую модель

В корневом `.env` должно быть задано:

```text
HEADWEAR_DETECTOR_MODE=onnx_classifier или onnx_detector
HEADWEAR_MODEL_PATH=...
HEADWEAR_INPUT_WIDTH=416
HEADWEAR_INPUT_HEIGHT=416
HEADWEAR_INPUT_NORMALIZATION_MODE=zero_one
HEADWEAR_CLASS_NAMES=allowed_sanitary_headwear,non_sanitary_headwear,unknown_unusable
HEADWEAR_COMPLIANT_LABELS=allowed_sanitary_headwear
HEADWEAR_VIOLATION_LABELS=non_sanitary_headwear
HEADWEAR_UNKNOWN_LABELS=unknown_unusable
```

Для диагностики без открытия событий:

```text
HEADWEAR_MODEL_POLICY=diagnostic_only
HEADWEAR_INCIDENTS_ENABLED=false
HEADWEAR_DEBUG_SAVE_CROPS=true
```

Для формирования событий:

```text
HEADWEAR_MODEL_POLICY=production
HEADWEAR_INCIDENTS_ENABLED=true
HEADWEAR_DEBUG_SAVE_CROPS=false
```

---

## 13. Evidence policy

Runtime не должен сохранять evidence на каждый кадр нарушения.

В корневом `.env` использовать:

```text
INCIDENT_EVIDENCE_MAX_PER_CASE=5
INCIDENT_EVIDENCE_MIN_INTERVAL_SECONDS=10
```

Смысл:

- первое evidence сохраняется сразу после открытия `OPEN`;
- следующие evidence сохраняются не чаще одного раза в 10 секунд;
- на один `IncidentCase` сохраняется не больше 5 evidence samples;
- `FrameStore` только пишет файлы; решение о частоте записи принимает runtime через `IncidentEvidenceLimiter`.

---

## 14. Запустить offline runtime export

Поднять API:

```powershell
python -m uvicorn app.main:app --host 127.0.0.1 --port 8090
```

Проверить статус:

```powershell
Invoke-RestMethod "http://127.0.0.1:8090/runtime/status" | ConvertTo-Json -Depth 20
```

Запустить обработку видео:

```powershell
python .\run_runtime.py `
  --base-url "http://127.0.0.1:8090" `
  --source-url "C:\path\to\video.mp4" `
  --max-seconds 60 `
  --print-metrics-summary
```

Проверить:

```powershell
Invoke-RestMethod "http://127.0.0.1:8090/runtime/tracks" | ConvertTo-Json -Depth 20
Invoke-RestMethod "http://127.0.0.1:8090/runtime/incidents" | ConvertTo-Json -Depth 20
```

---

## 15. Что считать нормальным результатом

Нормально:

- видео обработалось без падения;
- tracks/episodes появились;
- classifier получает только ROI головы из `TrackObservation.head_bbox`;
- плохие ROI дают skip/UNKNOWN;
- classifier calls меньше количества всех видимых tracks, если pre-skip работает;
- одиночный плохой кадр не открывает `OPEN`;
- evidence содержит full frame/person crop/head crop;
- на один case не сохраняется больше `INCIDENT_EVIDENCE_MAX_PER_CASE`;
- `track_episode_id` присутствует в incidents/evidence.

Плохо:

- classifier получает full frame;
- classifier вызывается без `TrackObservation.head_bbox`;
- плохие ROI массово дают `VIOLATION`;
- `OPEN` появляется после одного кадра;
- evidence сохраняется на каждый кадр;
- `/runtime/day-people` используется как основной endpoint;
- модель включена в incidents без проверки на test_real.

---

## 14. Tracking FPS and headwear classification FPS

Current 7 FPS video mode can keep both values equal:

```text
TRACKING_FPS=7
HEADWEAR_CLASSIFICATION_FPS=7
```

Later, when performance becomes important, tracking may run more often than headwear inference:

```text
TRACKING_FPS=7
HEADWEAR_CLASSIFICATION_FPS=2
```

In that mode runtime still updates tracks/episodes at tracking FPS. Frames not scheduled for headwear inference receive the technical reason code:

```text
headwear_classification_not_scheduled
```

Such frames must not open incidents and must not save evidence.

---

## 15. Track diagnostics

Track diagnostics are not ReID. They only describe possible tracker instability:

```text
track_id_switch_suspicions
track_fragmentation_suspicions
track_merge_suspicions
track_split_suspicions
```

These counters are useful when checking whether duplicate events may be caused by tracker fragmentation or people crossing each other.
