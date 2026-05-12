# ARCHITECTURE_MAP

## Назначение проекта

`vision` — standalone-сервис компьютерного зрения для **offline-обработки заранее скачанных видео**.

Главная задача сервиса: найти людей на видео, выделить область головы, оценить качество ROI, классифицировать санитарный головной убор, агрегировать покадровые сигналы во времени и сохранить проверяемые evidence-данные для возможного нарушения.

Проект не решает задачу персональной идентификации сотрудников.

---

# Текущая production-цепочка

```text
app/main.py
  -> app/api/routes_runtime.py
  -> app/pipeline/runtime.py
  -> app/pipeline/person_tracking_engine.py
  -> app/pipeline/tracking_types.py
  -> app/pipeline/quality_gate.py
  -> app/pipeline/track_episode_registry.py
  -> app/pipeline/human_observation.py
  -> app/pipeline/headwear_crop_geometry.py
  -> app/pipeline/headwear_detector.py
  -> app/pipeline/incident_engine.py
  -> app/storage/frame_store.py
  -> app/models/schemas.py
```

---

# Слои проекта

## Application layer

### `app/main.py`

Точка сборки FastAPI-приложения.

Отвечает за:

- загрузку `Settings`;
- базовую валидацию конфигурации;
- создание `VisionRuntimeService`;
- регистрацию routers;
- корректное shutdown runtime service.

Не должен:

- выполнять обработку кадров;
- запускать CV inference напрямую;
- создавать события;
- писать evidence.

---

## API layer

### `app/api/routes_health.py`

Health endpoint.

Используется для проверки, что приложение поднялось.

### `app/api/routes_runtime.py`

HTTP API для offline runtime.

Фактические endpoints:

```text
GET  /runtime/status
GET  /runtime/incidents
GET  /runtime/tracks
GET  /runtime/track-episodes
GET  /runtime/day-people      deprecated compatibility alias
POST /runtime/export-video
```

Отвечает за:

- получение runtime service из `app.state`;
- вызов методов service;
- возврат Pydantic response models.

Не должен:

- выполнять CV-логику;
- принимать решения по quality;
- менять event state;
- формировать evidence.

---

## Runtime orchestration layer

### `app/pipeline/runtime.py`

Главный orchestrator offline processing.

Ключевой класс:

```text
VisionRuntimeService
```

Основной рабочий метод:

```text
export_processed_video(...)
```

Фактический flow:

```text
1. API вызывает VisionRuntimeService.export_processed_video(...)
2. service проверяет readiness
3. service открывает source через cv2.VideoCapture
4. service читает кадры
5. часть кадров отправляется на анализ по processed_video_analysis_fps
6. PersonTrackingEngine возвращает TrackingFrameResult
7. QualityGate оценивает bbox каждого visible track
8. duplicate/partial suppression применяется на уровне frame processing
9. TrackEpisodeRegistry создает/обновляет track episodes
10. human_observation строит TrackObservation
11. HeadwearDetector оценивает ROI головы
12. IncidentEngine обновляет case state
13. FrameStore сохраняет evidence при подходящем событии
14. overlay рисуется на output video
15. status/stats публикуются для API
```

Что допустимо внутри runtime:

- orchestration;
- счетчики;
- progress;
- overlay;
- dispatch между слоями;
- защитная обработка исключений вокруг внешних компонентов.

Что нежелательно внутри runtime:

- бизнес-логика classification policy, которую можно вынести;
- прямое изменение private state incident engine;
- неограниченная запись на диск;
- синхронная тяжелая backend-синхронизация в основном цикле.

---

## Tracking layer

### `app/pipeline/person_tracking_engine.py`

Adapter над внешним tracking backend.

Отвечает за:

- загрузку модели;
- вызов `model.track(...)`;
- фильтрацию human detections;
- формирование `TrackedPersonObservation`;
- формирование `TrackingFrameResult`;
- заполнение `TrackingDiagnostics`;
- readiness/failure reason.

Не отвечает за:

- стабильную identity;
- headwear;
- incident;
- evidence;
- API DTO.

### `app/pipeline/tracking_types.py`

Внутренние dataclass/enum контракты tracking pipeline.

Ключевые сущности:

- `TrackingBackendType`;
- `ExternalTrackState`;
- `TrackedPersonObservation`;
- `TrackingDiagnostics`;
- `TrackingFrameResult`;
- `TrackEpisodeAssignmentKind`;
- `TrackEpisodeAssignment`;
- `TrackEpisodeFrameResult`.

Файл должен оставаться легким контрактным слоем и не должен импортировать OpenCV/model/runtime.

---

## Quality layer

### `app/pipeline/quality_gate.py`

Оценивает пригодность bbox/ROI для дальнейшей обработки.

Ключевой метод:

```text
QualityGate.assess(...)
```

Оценивает:

- валидность frame dimensions;
- clipping bbox;
- area ratio;
- bbox height;
- aspect ratio;
- crop/truncation;
- body/head occlusion;
- head visibility;
- blur по head crop;
- exposure по head crop;
- partial/fragment/lower-body-only/bent-over;
- interaction risk.

Возвращает:

```text
QualityAssessment
```

Важные поля:

- `is_valid`;
- `quality_score`;
- `head_visible`;
- `is_usable_for_tracking`;
- `is_usable_for_headwear`;
- `headwear_context_usable`;
- `visibility_state`;
- `reason_codes`.

---

## Track episode layer

### `app/pipeline/track_episode_registry.py`

Управляет временными episode-записями.

Ключевой класс:

```text
TrackEpisodeRegistry
```

Ключевые методы:

```text
update_frame(...)
mark_headwear_result(...)
snapshot(...)
finish_video(...)
```

Отвечает за:

- создание `track_episode_id`;
- связь external `track_id` -> current episode;
- candidate/promotion logic для новых треков;
- rejected assignments для плохих/partial observations;
- статусы `ACTIVE`, `LOST_RECENTLY`, `ENDED`;
- счетчики headwear/model/evidence по episode;
- snapshot для API.

Не отвечает за:

- распознавание физического человека;
- объединение разных episodes;
- ReID;
- headwear classification;
- incident state transitions.

---

## Observation layer

### `app/pipeline/human_observation.py`

Несмотря на имя файла, текущая основная сущность — `TrackObservation`.

Ключевые элементы:

- `ObservationType`;
- `VisibleParts`;
- `TrackObservation`;
- `HumanObservation = TrackObservation` compatibility alias;
- `build_track_observation_from_tracking(...)`;
- `build_human_observation_from_tracking(...)` compatibility function.

Отвечает за:

- построение observation из `TrackedPersonObservation`, `TrackEpisodeAssignment` и `QualityAssessment`;
- расчет `head_bbox`;
- расчет visible parts;
- расчет observation type;
- выставление `is_usable_for_headwear` и `is_usable_for_incident` через properties;
- сбор reason codes.

Не отвечает за:

- tracking;
- quality scoring;
- classification;
- incident aggregation;
- storage.

### `app/pipeline/headwear_crop_geometry.py`

Чистая геометрия ROI головы/головного убора.

Должен оставаться отдельным helper-слоем, чтобы classifier не строил crop случайно из полного кадра.

---

## Headwear layer

### `app/pipeline/headwear_detector.py`

Классификатор санитарного головного убора.

Ключевой метод production-flow:

```text
assess_observation(frame=..., observation=...)
```

Отвечает за:

- проверку готовности модели;
- извлечение head crop из `observation.head_bbox`;
- проверку geometry constraints head crop;
- preprocessing input;
- ONNX inference или placeholder mode;
- mapping classes -> `COMPLIANT` / `VIOLATION` / `UNKNOWN`;
- возврат `HeadwearAssessment`;
- debug crop saving, если явно включено.

Не отвечает за:

- создание track episode;
- event aggregation;
- storage evidence;
- API response models.

---

## Incident layer

### `app/pipeline/incident_engine.py`

Агрегирует headwear-сигналы во времени.

Ключевой метод:

```text
process_headwear_assessment(...)
```

Subject:

```text
track_episode_id
```

Состояния:

```text
CANDIDATE
OPEN
COOLDOWN
CLOSED
```

Отвечает за:

- sliding/time window по episode;
- фильтрацию usable/unknown сигналов;
- открытие события только после устойчивого окна;
- cooldown/close transitions;
- хранение active case per episode;
- выдачу changed cases.

Не отвечает за:

- запись файлов;
- classification;
- tracking;
- identity.

---

## Evidence/storage layer

### `app/storage/frame_store.py`

Сохраняет evidence и debug/runtime артефакты.

Production evidence должен включать:

- full frame;
- person crop;
- head crop;
- metadata;
- связь с `case_id`;
- связь с `track_episode_id`.

Риск слоя: без политики лимитов может расти объем файлов. Для длинных offline-прогонов нужно контролировать debug/evidence/output dirs.

---

## Metrics layer

### `app/pipeline/runtime_metrics.py`

Сохраняет runtime summary/metrics, если включено настройками.

Используется для анализа качества offline-прогона:

- сколько кадров прочитано;
- сколько проанализировано;
- сколько tracks/episodes;
- сколько quality ok/bad;
- сколько headwear calls/skips;
- сколько candidate/open events;
- сколько evidence.

---

## Models/schema layer

### `app/models/schemas.py`

Pydantic contracts для API и внутренних DTO.

Ключевые production-сущности:

- `BBox`;
- `QualityAssessment`;
- `HeadwearAssessment`;
- `TrackEpisodeRecord`;
- `TrackEpisodeResponse`;
- `IncidentCase`;
- `IncidentCaseResponse`;
- `RuntimeStats`;
- `RuntimeStatusResponse`;
- `CommandResponse`.

Deprecated compatibility:

- `DayPersonResponse(TrackEpisodeResponse)`;
- `DayPersonRecord(TrackEpisodeRecord)`;
- identity counters в `RuntimeStats`.

Эти compatibility elements не должны возвращать старую production identity-архитектуру.

---

## Config layer

### `app/config.py`

Собирает настройки из env.

Важные группы настроек:

- app/static paths;
- source/camera;
- person tracking backend;
- quality thresholds;
- track episode thresholds;
- headwear model/input/classes;
- incident window/cooldown/close;
- evidence/debug/runtime metrics;
- processed video export;
- optional backend sync.

Риск: в файле остаются legacy identity/reid настройки. Они не должны трактоваться как активная production identity logic, пока их реально не использует current runtime-flow.

---

## Clients layer

### `app/clients/backend_client.py`

Опциональная синхронизация incidents во внешний backend.

Для offline stage это вспомогательный слой. Ошибка backend-синхронизации не должна превращаться в санитарное событие и не должна ломать обработку видео без контролируемой причины.

---

## Tools layer

### `tools/check_requirements.py`

Легкая проверка того, что проект соответствует текущей offline track-centric архитектуре.

Должен проверять:

- наличие ключевых файлов;
- наличие ключевых architecture tokens;
- отсутствие возвращения запрещенных legacy identity modules;
- актуальность терминов документации.

Не должен требовать удаленные компоненты:

- `day_person_registry.py`;
- `partial_candidate_registry.py`;
- `scene_zones.py`;
- production `DayPersonRegistry`.

### `tools/make_ai_bundle.py`

Сборка project bundle для анализа/аудита.

### `tools/project_index.py`

Индексация структуры проекта.

### `tools/run_quality_gate.ps1`

Операционный скрипт проверки качества/команд.

---

## Scripts layer

### `scripts/headwear/*.ps1`

Скрипты подготовки датасета, обучения, экспорта ONNX и video mining.

Назначение:

- собрать реальные crops;
- подготовить датасет;
- обучить модель;
- экспортировать ONNX;
- проверить ONNX на debug crops;
- переключить runtime на новую модель;
- извлекать crops из больших видео;
- собирать review sheets.

Эти скрипты не являются online runtime. Они обслуживают dataset/model lifecycle.

---

# Deprecated / legacy зоны

Допускаются только как временная совместимость:

- `HumanObservation` alias;
- `build_human_observation_from_tracking(...)` compatibility wrapper;
- `/runtime/day-people` deprecated route;
- `DayPersonResponse` / `DayPersonRecord` aliases;
- identity fields, если они всегда неактивны.

Нельзя считать эти элементы текущей архитектурой.

---

# Что проверять при ревью

1. Runtime классифицирует ROI головы, а не full frame.
2. QualityGate стоит до усиления event.
3. `UNKNOWN` не подтверждает violation.
4. `OPEN` не создается по одному кадру.
5. Evidence связан с `case_id` и `track_episode_id`.
6. `track_episode_id` не описывается как person identity.
7. API routes не содержат CV/business logic.
8. `tools/check_requirements.py` не требует старую architecture.
9. Debug/evidence/output записи не растут бесконтрольно при длинном offline-прогоне.

---

## Runtime finalization and diagnostics update

Current offline runtime has two separate end-of-video responsibilities:

1. `TrackEpisodeRegistry.finish_video(reference_time)` closes active track episodes when the input video ends.
2. `IncidentEngine.finish_video(reference_time)` closes active `CANDIDATE`, `OPEN` and `COOLDOWN` incident cases with `video_finished` / `incident_closed_at_video_eof` reason codes.

This prevents stale active incidents from remaining in API/status after offline export is completed.

Tracking stability diagnostics are implemented separately in `app/pipeline/track_diagnostics.py` through `TrackDiagnosticsAnalyzer`. The module only emits diagnostic counters:

- `track_id_switch_suspicions`;
- `track_fragmentation_suspicions`;
- `track_merge_suspicions`;
- `track_split_suspicions`.

These counters are not ReID and must not be used as proof that two track episodes belong to the same physical person. They describe short-term tracker instability in the same spatial-temporal region and are used for metrics/status/debugging only.

Offline processing supports separate frequencies:

- `TRACKING_FPS` controls how often person tracking and track-episode updates run;
- `HEADWEAR_CLASSIFICATION_FPS` controls how often headwear inference and incident aggregation run;
- `PROCESSED_VIDEO_ANALYSIS_FPS` remains a backward-compatible fallback.

For current 7 FPS videos, `TRACKING_FPS=7` and `HEADWEAR_CLASSIFICATION_FPS=7` preserve the previous behavior.
