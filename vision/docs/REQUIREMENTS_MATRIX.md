# REQUIREMENTS_MATRIX

## Текущая целевая цепочка

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
-> Runtime API
```

---

# Tracking / track episode requirements

## REQ-001: `track_id` не должен считаться стабильной личностью

`track_id` приходит из внешнего tracker backend и является временным техническим id.

Реализация:

- `app/pipeline/person_tracking_engine.py`
- `app/pipeline/tracking_types.py`

Проверка:

- в production-flow нет создания `person_001`;
- `track_id` используется как source id;
- downstream subject строится через `track_episode_id`.

---

## REQ-002: `track_episode_id` должен быть явным subject key

`track_episode_id` создается для track episode и используется в observation, incident и evidence.

Реализация:

- `app/pipeline/track_episode_registry.py`
- `app/pipeline/human_observation.py`
- `app/pipeline/incident_engine.py`
- `app/storage/frame_store.py`
- `app/models/schemas.py`

Проверка:

- `TrackEpisodeRecord` содержит `track_episode_id`;
- `TrackObservation` содержит `track_episode_id`;
- `IncidentCase` содержит `track_episode_id`;
- evidence metadata содержит связь с case/episode.

---

## REQ-003: Partial/fragment track не должен становиться episode без проверки

Плохой, обрезанный, слишком маленький или partial track должен получить rejected assignment до promotion.

Реализация:

- `app/pipeline/quality_gate.py`
- `app/pipeline/track_episode_registry.py`

Проверка:

- reason codes содержат `candidate_partial_fragment_rejected` или близкий код;
- `partial_suppressed_count` увеличивается;
- episode не создается до выполнения критериев promotion.

---

## REQ-004: Track episode не является person identity

`TrackEpisodeRegistry` не должен объединять разные episodes как одного человека.

Реализация:

- `app/pipeline/track_episode_registry.py`
- `app/pipeline/human_observation.py`
- `app/models/schemas.py`

Проверка:

- нет production `DayPersonRegistry`;
- `HumanObservation` является compatibility alias к `TrackObservation`;
- `day_person_id/person_id` properties возвращают `None` или compatibility values без identity-смысла;
- `/runtime/day-people` deprecated.

---

# Quality requirements

## REQ-005: QualityGate должен возвращать полный downstream-контракт

`QualityAssessment` должен содержать поля, необходимые runtime, observation, headwear и incident layers.

Минимальные поля:

- `is_valid`;
- `quality_score`;
- `head_visible`;
- `is_cropped`;
- `occlusion_ratio`;
- `bbox_area_ratio`;
- `is_usable_for_tracking`;
- `is_usable_for_headwear`;
- `is_low_quality`;
- `is_truncated`;
- `is_occluded`;
- `is_partial_limb_only`;
- `is_lower_body_only`;
- `is_bent_over`;
- `is_interaction_risk`;
- `headwear_context_usable`;
- `visibility_state`;
- `reasons`;
- `reason_codes`.

Реализация:

- `app/models/schemas.py`
- `app/pipeline/quality_gate.py`

Проверка:

- `ruff` не показывает unused remnants;
- `vulture` не показывает dead identity variables;
- bad frame dimensions дают invalid assessment;
- invalid bbox после clipping дает invalid assessment.

---

## REQ-006: Низкое качество ROI не должно усиливать нарушение

Low-quality, cropped, occluded, tiny, blurred или non-evaluable observation не должно подтверждать violation.

Реализация:

- `app/pipeline/quality_gate.py`
- `app/pipeline/human_observation.py`
- `app/pipeline/runtime.py`
- `app/pipeline/incident_engine.py`

Проверка:

- `is_usable_for_headwear=False` ведет к pre-skip или `UNKNOWN`;
- `UNKNOWN` не увеличивает violation window как подтверждение;
- reason codes объясняют skip.

---

## REQ-007: Interaction risk должен блокировать надежную headwear-оценку

Если bbox/head region пересекается с другим человеком, observation не должен надежно подтверждать нарушение.

Реализация:

- `app/pipeline/quality_gate.py`
- `app/pipeline/runtime.py`
- `app/pipeline/human_observation.py`

Проверка:

- `is_interaction_risk=True`;
- `interaction_risk` попадает в reason codes;
- `TrackObservation.is_usable_for_incident=False`.

---

# Observation requirements

## REQ-008: TrackObservation должен быть стабильным переносчиком данных

`TrackObservation` должен передавать downstream-модулям все, что нужно для headwear и incident logic.

Реализация:

- `app/pipeline/human_observation.py`

Поля:

- `camera_id`;
- `track_episode_id`;
- `source_track_id`;
- `track_id`;
- `frame_index`;
- `observed_at`;
- `bbox`;
- `head_bbox`;
- `quality`;
- `visible_parts`;
- `observation_type`;
- `visibility_state`;
- `headwear_context_usable`;
- `interaction_risk`;
- `reason_codes`.

Проверка:

- `HeadwearDetector.assess_observation(...)` работает с `TrackObservation`;
- `IncidentEngine.process_headwear_assessment(...)` получает subject через `track_episode_id`.

---

## REQ-009: `HumanObservation` может быть только compatibility alias

Старое имя `HumanObservation` не должно означать старую identity-архитектуру.

Реализация:

- `app/pipeline/human_observation.py`

Проверка:

- `HumanObservation = TrackObservation`;
- `build_human_observation_from_tracking(...)` является wrapper/adaptor;
- новая документация использует `TrackObservation` как основной термин.

---

# Headwear requirements

## REQ-010: Classifier должен получать ROI головы, а не полный кадр

Основной production method:

```text
HeadwearDetector.assess_observation(frame, observation)
```

Реализация:

- `app/pipeline/human_observation.py`
- `app/pipeline/headwear_crop_geometry.py`
- `app/pipeline/headwear_detector.py`
- `app/pipeline/runtime.py`

Проверка:

- используется `observation.head_bbox`;
- full frame используется только как источник пикселей для crop;
- bad crop возвращает `UNKNOWN` / skip.

---

## REQ-011: Headwear `UNKNOWN` безопаснее ложного `VIOLATION`

Если модель не уверена, ROI плохой или результат неинформативен, нужно возвращать `UNKNOWN`.

Реализация:

- `app/pipeline/headwear_detector.py`
- `app/pipeline/runtime.py`
- `app/pipeline/incident_engine.py`

Проверка:

- low confidence -> `UNKNOWN`;
- invalid model output -> `UNKNOWN`;
- model error -> `UNKNOWN` or controlled failure;
- `UNKNOWN` не открывает `OPEN` incident.

---

## REQ-012: Несовпадение классов модели должно быть явно настроено

Class mapping должен быть задан через настройки:

- `HEADWEAR_CLASS_NAMES`;
- `HEADWEAR_COMPLIANT_LABELS`;
- `HEADWEAR_VIOLATION_LABELS`;
- `HEADWEAR_UNKNOWN_LABELS`.

Реализация:

- `app/config.py`
- `app/pipeline/headwear_detector.py`

Проверка:

- runtime status показывает mode/readiness;
- неверная модель не должна молча выдавать санитарные события.

---

# Incident requirements

## REQ-013: Инцидент нельзя открыть по одному кадру

Один violation-сигнал может создать `CANDIDATE`, но не должен открыть `OPEN`.

Реализация:

- `app/pipeline/incident_engine.py`
- `app/config.py`

Параметры:

- `INCIDENT_WINDOW_SIZE`;
- `INCIDENT_WINDOW_SECONDS`;
- `INCIDENT_OPEN_MIN_VALID`;
- `INCIDENT_OPEN_VIOLATION_RATIO`;
- `INCIDENT_OPEN_MIN_DURATION_SEC`.

Проверка:

- single violation не дает `OPEN`;
- серия usable violations открывает `OPEN`.

---

## REQ-014: Событие должно иметь состояния `CANDIDATE`, `OPEN`, `COOLDOWN`, `CLOSED`

Реализация:

- `app/models/schemas.py`
- `app/pipeline/incident_engine.py`

Проверка:

- `IncidentState` содержит `CANDIDATE`, `OPEN`, `COOLDOWN`, `CLOSED`;
- `OPEN` появляется только после устойчивого окна;
- `COOLDOWN` подавляет дубли;
- `CLOSED` появляется после inactivity/close timeout.

---

## REQ-015: Событие должно быть привязано к `track_episode_id`

Реализация:

- `app/models/schemas.py`
- `app/pipeline/incident_engine.py`
- `app/storage/frame_store.py`

Проверка:

- `IncidentCase.track_episode_id` заполнен;
- `IncidentCaseResponse.track_episode_id` заполнен;
- evidence metadata связывает файл с episode.

---

## REQ-016: Нормальные кадры должны ослаблять активное событие

Если по тому же episode появляется серия `COMPLIANT` usable-сигналов, событие может перейти в `COOLDOWN`.

Реализация:

- `app/pipeline/incident_engine.py`

Проверка:

- compliant ratio учитывается;
- cooldown не создает новый duplicate event;
- новые violation могут reopen event.

---

# Evidence / storage requirements

## REQ-017: Evidence сохраняется только для релевантных событий

Evidence не должен сохраняться на каждый кадр без ограничений.

Реализация:

- `app/pipeline/runtime.py`
- `app/storage/frame_store.py`

Проверка:

- evidence пишется после incident decision;
- есть `case_id`;
- есть `track_episode_id`;
- есть full frame/person crop/head crop/metadata;
- плохой ROI не должен создавать мусорный evidence.

---

## REQ-018: Debug crops не являются production evidence

Debug crops полезны для обучения/аудита, но не должны смешиваться с evidence событий.

Реализация:

- `app/pipeline/headwear_detector.py`
- `app/storage/frame_store.py`
- `config/headwear_policy_v1.env`

Проверка:

- debug saving включается явно;
- production evidence лежит отдельно;
- длинный прогон не раздувает debug директории без причины.

---

# API requirements

## REQ-019: `/runtime/status` должен отражать offline export state

Реализация:

- `app/api/routes_runtime.py`
- `app/pipeline/runtime.py`
- `app/models/schemas.py`

Проверка:

- `running` меняется во время export;
- progress обновляется;
- `last_export_output_path` заполняется после export;
- readiness/failure reason доступны.

---

## REQ-020: `/runtime/tracks` должен отдавать track episodes

Реализация:

- `app/api/routes_runtime.py`
- `app/pipeline/runtime.py`
- `app/models/schemas.py`

Проверка:

- response model `TrackEpisodeResponse`;
- есть `track_episode_id`;
- есть `source_track_id`;
- есть status/counters/reason_codes.

---

## REQ-021: `/runtime/day-people` является deprecated alias

Этот endpoint не должен использоваться как доказательство наличия person identity.

Реализация:

- `app/api/routes_runtime.py`
- `app/models/schemas.py`

Проверка:

- route помечен `deprecated=True`;
- возвращает `TrackEpisodeResponse`;
- документация рекомендует `/runtime/tracks` или `/runtime/track-episodes`.

---

## REQ-022: `/runtime/incidents` должен отдавать проверяемые cases

Реализация:

- `app/api/routes_runtime.py`
- `app/pipeline/runtime.py`
- `app/models/schemas.py`

Проверка:

- response содержит `case_id`;
- response содержит `track_episode_id`;
- response содержит state;
- response содержит evidence paths, если evidence уже прикреплен;
- пустой список корректно обрабатывается.

---

# Architecture requirements

## REQ-023: Runtime не должен использовать старую handwritten identity-архитектуру

Запрещено возвращать production-зависимость от:

- `DayPersonRegistry`;
- handwritten ReID modules;
- stable anonymous person ids;
- appearance/color/texture matching как core runtime logic.

Реализация:

- `app/pipeline/runtime.py`
- `tools/check_requirements.py`

Проверка:

- `tools/check_requirements.py` не требует `day_person_registry.py`;
- forbidden legacy modules не импортируются;
- documentation chain содержит `TrackEpisodeRegistry`.

---

## REQ-024: Tools должны проверять текущую offline architecture

`tools/check_requirements.py` должен проверять текущую архитектуру, а не старую.

Реализация:

- `tools/check_requirements.py`

Проверка:

- нет ошибки по отсутствию `day_person_registry.py`;
- нет ошибки по отсутствию `part_cropper.py`;
- нет ошибки по отсутствию `partial_candidate_registry.py`;
- нет ошибки по отсутствию `scene_zones.py`;
- docs tokens соответствуют `TrackEpisodeRegistry`, `TrackObservation`, `track_episode_id`, `OPEN`.

---

# Runtime / export requirements

## REQ-025: Offline export должен быть основным рабочим режимом текущей версии

Реализация:

- `app/api/routes_runtime.py`
- `app/pipeline/runtime.py`
- `run_runtime.py`

Проверка:

- `POST /runtime/export-video` запускает обработку;
- `run_runtime.py` может вызвать export;
- обработанный video output сохраняется;
- status показывает progress.

---

# Минимальный набор проверок

```powershell
python -m ruff check app run_runtime.py check_video_runtime.py tools
python -m vulture app --min-confidence 70
python tools\check_requirements.py
python -m compileall -q app run_runtime.py check_video_runtime.py tools
```

---

## Added runtime guarantees

| Requirement | Current implementation | Status |
|---|---|---|
| Active incidents must not stay open after video EOF | `IncidentEngine.finish_video(reference_time)` closes active `CANDIDATE`, `OPEN` and `COOLDOWN` cases with EOF reason codes. | implemented |
| Tracking diagnostics must not become ReID | `TrackDiagnosticsAnalyzer` emits suspicion counters only and does not merge episodes or identify people. | implemented |
| Tracking and headwear inference frequencies may differ | `TRACKING_FPS` and `HEADWEAR_CLASSIFICATION_FPS` are separate settings; `PROCESSED_VIDEO_ANALYSIS_FPS` is fallback. | implemented |
| Frames processed by tracking but not scheduled for headwear inference must not create incidents | Runtime emits `headwear_classification_not_scheduled` and skips incident/evidence logic for that frame. | implemented |
