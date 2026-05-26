# Vision documentation

Этот каталог содержит подробную документацию по video analytics runtime.

## Основные документы

```text
ARCHITECTURE_MAP.md           # карта архитектуры vision runtime
TARGET_LOGIC.md               # целевая логика и ключевые понятия
REQUIREMENTS_MATRIX.md        # связь требований и реализации
HEADWEAR_DO_THIS_NOW.md       # текущие рабочие задачи по headwear
HEADWEAR_MODEL_REBUILD_PLAN.md
HEADWEAR_VIDEO_MINING_NOW.md
DEVELOPMENT_PLAN.md
AI_RULES.md
```

## Что считать production path

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
```

## Что считать dataset/debug path

```text
scripts/headwear/
tools/dataset/
tools/make_external_dataset_review_pack.py
debug/runtime scripts
review pack scripts
mining scripts
```

## Основное правило описания

Vision runtime — это не система распознавания личности. Корректно писать:

> Сервис формирует проверяемые события возможного нарушения на основе временных эпизодов треков и анализа ROI головы.

Некорректно писать:

> Сервис распознает сотрудников и фиксирует нарушение за человеком.
