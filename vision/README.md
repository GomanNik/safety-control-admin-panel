# Vision runtime

`vision/` — Python/FastAPI-сервис компьютерного зрения для offline-обработки архивных видеозаписей.

## Назначение

Сервис анализирует видеозапись, выделяет людей, сопровождает временные треки, формирует ROI головы, классифицирует наличие/состояние санитарного головного убора и формирует проверяемые события возможного нарушения.

Сервис не выполняет персональную идентификацию сотрудников.

## Основной pipeline

```text
video source
    ↓
cv2.VideoCapture
    ↓
PersonTrackingEngine
    ↓
QualityGate
    ↓
TrackEpisodeRegistry
    ↓
TrackObservation
    ↓
HeadwearDetector
    ↓
IncidentEngine
    ↓
FrameStore / evidence
    ↓
Runtime API
```

## Структура

```text
vision/
├── app/
│   ├── api/          # FastAPI routes
│   ├── clients/      # backend client
│   ├── models/       # Pydantic schemas
│   ├── pipeline/     # основная CV/runtime логика
│   ├── storage/      # evidence/frame/person crop stores
│   └── utils/        # утилиты
├── docs/             # подробная документация vision-контура
├── scripts/headwear/ # PowerShell-сценарии по headwear workflow
├── tests/            # pytest-тесты
├── tools/            # служебные инструменты
├── requirements.txt
└── run_runtime.py
```

## Ключевые файлы production path

```text
app/main.py
app/api/routes_runtime.py
app/pipeline/runtime.py
app/pipeline/person_tracking_engine.py
app/pipeline/quality_gate.py
app/pipeline/track_episode_registry.py
app/pipeline/human_observation.py
app/pipeline/headwear_detector.py
app/pipeline/incident_engine.py
app/storage/frame_store.py
app/models/schemas.py
```

## Runtime endpoints

Основные endpoints:

```text
GET  /runtime/status
GET  /runtime/incidents
GET  /runtime/tracks
GET  /runtime/track-episodes
GET  /runtime/day-people          deprecated compatibility alias
POST /runtime/export-video
POST /runtime/collect-person-crops
```

## Запуск окружения

```powershell
cd "C:\Users\Goman Nikita\Desktop\safety-control-admin-panel\vision"

py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

## Проверка

```powershell
python -m compileall -q app run_runtime.py check_video_runtime.py tools
pytest
```

## Запуск сервера

```powershell
python -m uvicorn app.main:app --host 0.0.0.0 --port 8090
```

## Запуск обработки

```powershell
python .\run_runtime.py --base-url "http://127.0.0.1:8090" --max-seconds 60 --print-metrics-summary
```

## Сбор person crops с заданного времени видео

```powershell
python .\run_runtime.py `
  --collect-person-crops `
  --source-url "<path-to-video>" `
  --output-dir "<output-dir>" `
  --start-seconds 3600
```

## Что не хранится в Git

```text
vision/data/
vision/datasets/
vision/models/
vision/runs/
vision/_handoff/
*.pt
*.onnx
*.engine
*.mp4
*.avi
*.mov
*.mkv
```

## Документация

Основные документы:

```text
vision/docs/ARCHITECTURE_MAP.md
vision/docs/TARGET_LOGIC.md
vision/docs/REQUIREMENTS_MATRIX.md
vision/docs/HEADWEAR_MODEL_REBUILD_PLAN.md
vision/docs/HEADWEAR_VIDEO_MINING_NOW.md
```

## Важные термины

### track_id

Временный внешний id от tracking backend. Не является персональной идентичностью.

### track_episode_id

Временный идентификатор эпизода трека в пределах одной offline-обработки. Используется как subject key для observation, incident и evidence.

### Head ROI

Область головы/головного убора, выделенная из bbox человека. Классификатор должен работать по ROI, а не по полному кадру.

### Проверяемое событие

Событие возможного нарушения, сформированное по временной агрегации сигналов, а не по одному кадру.

## Границы ответственности

Vision runtime должен:

- читать видео;
- анализировать кадры;
- формировать временные track episodes;
- выделять ROI головы;
- оценивать качество наблюдения;
- классифицировать головной убор;
- агрегировать сигналы;
- сохранять evidence;
- отдавать runtime status/tracks/incidents.

Vision runtime не должен:

- выполнять персональную идентификацию;
- хранить датасеты и модели в Git;
- зависеть от UI;
- смешивать production path с dataset/debug tools без явного описания.
