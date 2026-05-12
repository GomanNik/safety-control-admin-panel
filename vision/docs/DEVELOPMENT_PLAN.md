# DEVELOPMENT_PLAN

## Цель плана

План фиксирует дальнейшие шаги развития текущего `vision` проекта как **offline track-centric video processing service**.

Он не требует возвращения старого online runtime и не требует возвращения production `DayPersonRegistry`.

Текущая целевая цепочка:

```text
VisionRuntimeService.export_processed_video
-> PersonTrackingEngine
-> TrackingFrameResult
-> QualityGate
-> TrackEpisodeRegistry
-> TrackObservation
-> HeadwearDetector
-> IncidentEngine
-> FrameStore
-> API
```

---

# Этап 0. Зафиксировать базовую чистоту проекта

## Цель

Убедиться, что код после безопасной чистки не сломан.

## Команды

```powershell
python -m ruff check app run_runtime.py check_video_runtime.py tools
python -m vulture app --min-confidence 70
python tools\check_requirements.py
python -m compileall -q app run_runtime.py check_video_runtime.py tools
```

## Критерий готовности

- `ruff` проходит;
- `vulture` не показывает явный dead code в `app`;
- `compileall` проходит;
- `check_requirements.py` не выдает errors;
- warnings по отсутствующим тестам допустимы до этапа test hardening.

---

# Этап 1. Документация под текущий offline pipeline

## Цель

Убрать из документации старую production-схему с `DayPersonRegistry`, `person_001`, `CONFIRMED/CONFLICT`, `PartCropper`, `PartialCandidateRegistry`.

## Файлы

- `docs/TARGET_LOGIC.md`
- `docs/ARCHITECTURE_MAP.md`
- `docs/REQUIREMENTS_MATRIX.md`
- `docs/AI_RULES.md`
- `docs/DEVELOPMENT_PLAN.md`

## Должно быть

Документация должна использовать как основные термины:

- `TrackEpisodeRegistry`;
- `TrackObservation`;
- `track_episode_id`;
- `TrackEpisodeResponse`;
- `IncidentState.CANDIDATE`;
- `IncidentState.OPEN`;
- `IncidentState.COOLDOWN`;
- `IncidentState.CLOSED`.

Deprecated элементы можно упоминать только как совместимость:

- `HumanObservation = TrackObservation`;
- `/runtime/day-people`;
- `DayPersonResponse`;
- `DayPersonRecord`.

## Критерий готовности

```powershell
python tools\check_requirements.py
```

Не должно быть ошибок по doc tokens.

---

# Этап 2. Contract tests для текущей архитектуры

## Цель

Закрепить фактическую offline track-centric архитектуру тестами.

## Рекомендуемые файлы

- `tests/test_tracking_types.py`
- `tests/test_track_episode_registry.py`
- `tests/test_human_observation_new_pipeline.py`
- `tests/test_runtime_new_tracking_pipeline_static.py`
- `tests/test_headwear_observation_contract.py`
- `tests/test_incident_observation_contract.py`

## Минимальные проверки

### Tracking types

Проверить:

- `TrackingFrameResult` содержит visible/lost/removed tracks;
- `TrackedPersonObservation` хранит `track_id`, bbox, confidence, frame_index;
- `TrackEpisodeAssignment` хранит `track_episode_id` и не содержит person identity logic.

### TrackEpisodeRegistry

Проверить:

- плохой quality не создает episode;
- partial/lower-body/border fragment не создает episode;
- good track создает episode после threshold;
- lost/removed track переводит episode в нужный status;
- `finish_video(...)` завершает active episodes.

### TrackObservation

Проверить:

- observation строится из tracking + assignment + quality;
- `head_bbox` есть для usable headwear context;
- `is_usable_for_headwear=False` для плохого ROI;
- `HumanObservation` остается alias, но не вводит identity.

### Headwear contract

Проверить:

- `assess_observation(...)` использует `observation.head_bbox`;
- bad ROI возвращает `UNKNOWN` или skip reason;
- full frame не классифицируется как объект.

### Incident contract

Проверить:

- single violation не открывает `OPEN`;
- серия usable violations открывает `OPEN`;
- `UNKNOWN` не усиливает violation window;
- compliant signals переводят `OPEN` в `COOLDOWN` при выполнении условий.

## Критерий готовности

```powershell
python -m pytest tests -q
python tools\check_requirements.py --strict
```

---

# Этап 3. Ограничение evidence/debug/runtime outputs

## Цель

Сделать offline-прогоны безопасными по диску.

## Файлы

- `app/pipeline/runtime.py`
- `app/storage/frame_store.py`
- `app/pipeline/headwear_detector.py`
- `app/config.py`
- `config/headwear_policy_v1.env`

## Что сделать

1. Ввести явный лимит evidence на один `case_id`.
2. Разделить production evidence и debug crops.
3. Убедиться, что debug crops выключены по умолчанию для production-прогона.
4. Добавить retention или cleanup для processed video/debug/metrics, если offline-прогоны длинные.
5. Не сохранять low-quality/headwear-unusable кадры как evidence.

## Критерий готовности

После длинного прогона:

- evidence count ограничен;
- debug folders не растут без явного включения;
- metadata связывает evidence с `case_id` и `track_episode_id`;
- runtime не падает при ошибке записи одного evidence файла.

---

# Этап 4. Укрепление IncidentEngine

## Цель

Сделать событие возможного нарушения более проверяемым и устойчивым.

## Файл

- `app/pipeline/incident_engine.py`

## Что сделать

1. Явно разделить internal `CANDIDATE` и public incident, если frontend не должен показывать candidates.
2. На завершении видео закрывать active cases по завершенным episodes.
3. Зафиксировать reason codes для переходов:
   - candidate created;
   - opened after stable violation;
   - cooldown after compliant signals;
   - closed after inactivity;
   - reopened after new violation.
4. Проверить, что `UNKNOWN` не увеличивает violation ratio.
5. Проверить, что bad quality не становится usable signal.

## Критерий готовности

- один кадр не открывает `OPEN`;
- event имеет начало, последнюю фиксацию, evidence, confidence и duration;
- в конце видео не остается потерянных active cases без понятного state.

---

# Этап 5. Укрепление HeadwearDetector

## Цель

Снизить риск ложных нарушений из-за плохого ROI или неверного mapping классов.

## Файлы

- `app/pipeline/headwear_detector.py`
- `app/pipeline/headwear_crop_geometry.py`
- `app/pipeline/human_observation.py`
- `app/config.py`

## Что сделать

1. Добавить startup/self-check class mapping.
2. Проверить input shape до первого runtime-прогона.
3. Зафиксировать порядок классов модели в env/docs.
4. Добавить explicit reasons для:
   - bad crop geometry;
   - model not ready;
   - low confidence;
   - class mapping missing;
   - unsupported output shape.
5. Убедиться, что `diagnostic_only` policy не открывает incidents случайно.

## Критерий готовности

- неверная модель не дает ложный `VIOLATION`;
- низкая уверенность дает `UNKNOWN`;
- classifier получает head crop;
- debug crops помогают проверять реальный вход модели.

---

# Этап 6. Runtime decomposition без изменения логики

## Цель

Сделать `runtime.py` проще сопровождать, не меняя поведение.

## Файл

- `app/pipeline/runtime.py`

## Что можно вынести

1. Overlay drawing helper.
2. Export video writer helper.
3. Evidence attachment helper.
4. Backend sync helper.
5. Duplicate track suppression helper.
6. Frame processing result builder.

## Что не менять без тестов

- порядок `quality -> episode -> observation -> headwear -> incident`;
- pre-skip headwear logic;
- event window parameters;
- evidence capture conditions;
- duplicate suppression thresholds.

## Критерий готовности

- output на одном и том же видео не меняется без причины;
- counters совпадают или изменение объяснено;
- ruff/compileall/tests проходят.

---

# Этап 7. Runtime scenario hardening для offline-видео

## Цель

Сделать обработку скачанных видео устойчивой к плохим входным данным.

## Сценарии

- файл не существует;
- `VideoCapture` не открылся;
- FPS неизвестен или равен 0;
- frame count неизвестен;
- `read()` вернул пустой кадр;
- короткое видео;
- видео без людей;
- несколько людей;
- пересечение людей;
- плохой свет;
- сильное размытие;
- кадры с частично видимыми людьми.

## Критерий готовности

- status/message объясняет причину;
- runtime не падает без controlled error;
- санитарные events не создаются из технических ошибок;
- output path и metrics корректны.

---

# Этап 8. Dataset/model lifecycle

## Цель

Поддерживать модель headwear на реальных ROI из runtime.

## Файлы

- `docs/HEADWEAR_VIDEO_MINING_NOW.md`
- `docs/HEADWEAR_MODEL_REBUILD_PLAN.md`
- `docs/HEADWEAR_DO_THIS_NOW.md`
- `scripts/headwear/*.ps1`

## Что важно

- собирать именно head/person crops из реального runtime context;
- размечать `allowed_sanitary_headwear`, `non_sanitary_headwear`, `unknown_unusable`;
- не обучать модель на мусорных/неинформативных ROI как на violation;
- проверять ONNX на debug crops из реального видео;
- переключать runtime на модель только после test_real.

---

# Финальная проверка перед важным прогоном

```powershell
$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0
$ProgressPreference = "SilentlyContinue"

python -m ruff check app run_runtime.py check_video_runtime.py tools
python -m vulture app --min-confidence 70
python tools\check_requirements.py
python -m compileall -q app run_runtime.py check_video_runtime.py tools

python -m uvicorn app.main:app --host 127.0.0.1 --port 8090
```

В отдельном терминале:

```powershell
Invoke-RestMethod "http://127.0.0.1:8090/healthz" | ConvertTo-Json -Depth 20
Invoke-RestMethod "http://127.0.0.1:8090/runtime/status" | ConvertTo-Json -Depth 20
```

После запуска export:

```powershell
Invoke-RestMethod "http://127.0.0.1:8090/runtime/tracks" | ConvertTo-Json -Depth 20
Invoke-RestMethod "http://127.0.0.1:8090/runtime/incidents" | ConvertTo-Json -Depth 20
```
