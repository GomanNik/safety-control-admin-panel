# TARGET_LOGIC

## Главная задача проекта

Проект `vision` выполняет **offline-анализ заранее скачанных видео** для контроля санитарных головных уборов в производственной столовой.

Текущая целевая логика:

1. открыть видеофайл или другой доступный offline/video source;
2. прочитать кадры;
3. найти и сопровождать людей внешним tracking backend;
4. для каждого видимого трека оценить качество bbox;
5. создать временный `track_episode_id` для достаточно надежного track episode;
6. сформировать ROI головы/головного убора;
7. проверить пригодность ROI через quality/visibility flags;
8. классифицировать состояние головного убора только по ROI головы;
9. агрегировать покадровые сигналы во временном окне;
10. создать проверяемое событие возможного нарушения;
11. сохранить evidence;
12. отдать status, tracks и incidents через API.

Система **не распознает реальную личность сотрудника** и не выполняет персональную идентификацию.

---

## Главная production-цепочка

```text
VisionRuntimeService.export_processed_video
-> cv2.VideoCapture
-> PersonTrackingEngine.process_frame
-> TrackingFrameResult
-> QualityGate.assess
-> TrackEpisodeRegistry.update_frame
-> TrackEpisodeAssignment
-> build_track_observation_from_tracking
-> TrackObservation
-> HeadwearDetector.assess_observation
-> HeadwearAssessment
-> IncidentEngine.process_headwear_assessment
-> IncidentCase
-> FrameStore.save_incident_evidence
-> RuntimeStatus / Tracks / Incidents API
```

---

# Ключевые понятия

## `track_id`

`track_id` — временный внешний id, который приходит из tracking backend.

Свойства:

- создается внешним tracker backend;
- может измениться при потере объекта;
- может исчезнуть при occlusion или выходе из кадра;
- не является стабильным идентификатором человека;
- не должен использоваться как `person_id`.

## `track_episode_id`

`track_episode_id` — временный идентификатор эпизода трека внутри одной offline-обработки видео.

Свойства:

- создается `TrackEpisodeRegistry`;
- привязан к текущей обработке видео и текущей runtime-сессии;
- строится вокруг external `track_id`, но явно отделен от него;
- используется как subject key для observation, incident и evidence;
- не является персональной идентификацией;
- не доказывает, что повторно появившийся объект — тот же физический человек.

Пример смысла:

```text
camera_1__session-abc123__track-7__episode-000004
```

Это означает: в рамках данной обработки видео был выделен четвертый эпизод трека, связанный с внешним `track_id=7`.

## `TrackEpisodeRegistry`

`TrackEpisodeRegistry` — слой, который управляет временными track episodes.

Он нужен не для identity, а для того, чтобы downstream-слои работали не с голым `track_id`, а с явной сущностью episode.

Статусы episode:

```text
ACTIVE
LOST_RECENTLY
ENDED
```

## `TrackObservation`

`TrackObservation` — объект наблюдения одного track episode на одном кадре.

Он объединяет:

- `camera_id`;
- `track_episode_id`;
- `source_track_id`;
- `frame_index`;
- `observed_at`;
- bbox человека;
- ROI головы `head_bbox`;
- `QualityAssessment`;
- visible parts;
- observation type;
- visibility state;
- флаги пригодности для headwear и incident;
- reason codes.

`TrackObservation` не принимает решений по identity и не открывает incident.

`HumanObservation` в коде может оставаться только как compatibility alias к `TrackObservation`.

---

# PersonTrackingEngine

## Назначение

`PersonTrackingEngine` — adapter над внешним tracking backend для людей.

В текущей версии используется подход tracking-by-detection через вызов `model.track(...)`.

## Должен делать

- загружать person/tracking model;
- вызывать external tracking backend;
- фильтровать detections по классу человека;
- возвращать bbox;
- возвращать confidence;
- возвращать external `track_id`;
- возвращать состояние трека;
- вести `frame_index`;
- формировать `TrackingDiagnostics`.

## Не должен делать

- создавать `person_id`;
- создавать stable identity;
- проверять headwear;
- решать sanitary event;
- сохранять evidence;
- выполнять ReID.

---

# QualityGate

## Назначение

`QualityGate` оценивает, пригоден ли bbox/ROI для дальнейшей обработки.

## Должен оценивать

- frame dimensions;
- bbox после clipping;
- bbox area ratio;
- bbox height;
- aspect ratio;
- crop/truncation по границам кадра;
- occlusion относительно соседних bbox;
- видимость head band;
- blur по head ROI;
- exposure/contrast по head ROI;
- partial/fragment/lower-body-only cases;
- interaction risk.

## Должен возвращать

`QualityAssessment` с ключевыми полями:

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

Deprecated identity-related поля могут присутствовать в schema для совместимости, но должны оставаться неактивными.

## Не должен делать

- назначать identity;
- создавать `track_episode_id`;
- классифицировать головной убор;
- создавать incident;
- сохранять evidence.

---

# TrackEpisodeRegistry

## Назначение

`TrackEpisodeRegistry` создает и сопровождает временные episode-записи для достаточно надежных треков.

Это **не реестр людей**.

## Должен делать

- принимать `TrackingFrameResult` и `qualities_by_track_id`;
- отклонять некачественные, partial и fragment tracks;
- ждать минимального числа stable hits;
- создавать `track_episode_id`;
- обновлять episode status;
- учитывать lost/removed tracks;
- завершать episodes при окончании видео;
- копить статистику headwear/evidence по episode;
- отдавать snapshot для API.

## Не должен делать

- объединять разные track episodes в одного человека;
- выполнять ReID;
- сравнивать внешность людей;
- использовать headwear как identity-признак;
- создавать `person_001`.

## Правила promotion

Новый episode можно создать только если:

- track пригоден для episode;
- quality есть;
- quality достаточно высокое;
- track имеет достаточно stable hits или проходит fast promotion;
- bbox не является partial/fragment;
- при включенной настройке требуется видимая голова;
- нет interaction risk, который делает observation ненадежным.

Новый episode нельзя создать, если:

- bbox слишком маленький;
- человек виден только частично;
- видна только нижняя часть тела;
- голова обрезана границей кадра;
- есть сильный interaction/overlap risk;
- quality missing или слишком низкое.

---

# Head ROI

ROI головы формируется из bbox человека через `headwear_crop_geometry.py` и `human_observation.py`.

Правило:

```text
HeadwearDetector должен классифицировать ROI головы, а не полный кадр.
```

Если ROI плохой, слишком маленький, слишком вытянутый, обрезан, перекрыт, размыт или не содержит надежной зоны головы, результат должен уходить в `UNKNOWN` или pre-skip, а не подтверждать нарушение.

---

# HeadwearDetector

## Назначение

`HeadwearDetector` определяет состояние санитарного головного убора по ROI головы.

## Вход

Основной production-вход:

```text
HeadwearDetector.assess_observation(frame, observation)
```

где `observation` — это `TrackObservation` с `head_bbox` и quality flags.

## Выход

`HeadwearAssessment`:

```text
COMPLIANT
VIOLATION
UNKNOWN
```

Дополнительно:

- confidence;
- label;
- class_id;
- model_name;
- quality_score;
- reason;
- reason_codes;
- raw_scores.

## Правила

- `UNKNOWN` безопаснее ложного `VIOLATION`.
- Low confidence должен давать `UNKNOWN`.
- Bad ROI должен давать `UNKNOWN` или skip.
- Ошибка модели не должна превращаться в санитарное событие.
- Class label mapping должен быть явно задан через настройки.

---

# IncidentEngine

## Назначение

`IncidentEngine` превращает покадровые headwear-сигналы в проверяемые события возможного нарушения.

## Subject

Текущий subject:

```text
track_episode_id
```

Событие привязано к episode, а не к персональной личности.

## Состояния события

```text
CANDIDATE
OPEN
COOLDOWN
CLOSED
```

### CANDIDATE

Есть начальные violation-сигналы, но временное окно еще не подтвердило устойчивое событие.

### OPEN

Событие открыто после выполнения условий окна:

- достаточно usable observations;
- достаточно высокий violation ratio;
- достаточная длительность violation;
- confidence/quality не ниже порогов.

### COOLDOWN

После серии нормальных/ослабляющих сигналов событие переходит в cooldown, чтобы подавлять дубли и не дергать статус.

### CLOSED

Событие закрыто после inactivity/timeout или явного завершения episode.

## Один кадр

Один плохой кадр может создать внутренний `CANDIDATE`, но не должен становиться надежным `OPEN` событием.

---

# Evidence

Evidence должно сохраняться только для проверяемых событий и информативных кадров.

Минимальный состав evidence:

- full frame;
- person crop;
- head crop;
- metadata JSON/record;
- связь с `case_id`;
- связь с `track_episode_id`;
- confidence;
- observed time.

Evidence не должно быть:

- записью всего потока без ограничений;
- набором мусорных low-quality кадров;
- подтверждением события без head ROI;
- заменой temporal aggregation.

---

# API

## `/runtime/export-video`

Основная команда текущего проекта.

Запускает offline processing видео и возвращает `CommandResponse`.

## `/runtime/status`

Возвращает `RuntimeStatusResponse`:

- running;
- camera_id;
- detector/headwear readiness;
- runtime stats;
- progress;
- last output path;
- counters по tracks, episodes, incidents, quality, headwear.

## `/runtime/tracks`

Возвращает список `TrackEpisodeResponse`.

Это основной endpoint для текущих/последних track episodes.

## `/runtime/track-episodes`

Alias endpoint для `tracks`.

## `/runtime/day-people`

Deprecated compatibility endpoint.

Он возвращает те же `TrackEpisodeResponse`, но не должен трактоваться как реестр людей.

## `/runtime/incidents`

Возвращает `IncidentCaseResponse`.

Событие содержит:

- `case_id`;
- `track_episode_id`;
- `camera_id`;
- state;
- opened/last_confirmed/closed timestamps;
- source_track_id;
- evidence paths;
- evidence_count;
- max_confidence;
- violation_duration_sec;
- reason_codes.

---

# Главные запреты

Нельзя:

- возвращать production `DayPersonRegistry`;
- создавать stable person ids;
- использовать `track_id` как `person_id`;
- считать `track_episode_id` персональной идентификацией;
- отправлять full frame в headwear classifier;
- открывать `OPEN` incident по одному кадру;
- усиливать событие через `UNKNOWN`;
- использовать плохой ROI как доказательство нарушения;
- смешивать ошибки видео/модели с санитарными событиями.

---

# Definition of Done

Текущий offline runtime считается согласованным с целевой логикой, если:

- `ruff` проходит без ошибок;
- `vulture` не находит явного dead code в `app`;
- `compileall` проходит;
- `tools/check_requirements.py` не выдает ошибок;
- `TARGET_LOGIC.md` и `REQUIREMENTS_MATRIX.md` используют `TrackEpisodeRegistry`, `TrackObservation`, `track_episode_id`;
- runtime запускает offline export;
- classifier получает ROI головы;
- bad ROI не усиливает incident;
- один кадр не открывает `OPEN` incident;
- evidence связан с `case_id` и `track_episode_id`.

---

## EOF finalization and tracker diagnostics

At the end of an offline video export, runtime must finalize both tracks and incidents:

```text
TrackEpisodeRegistry.finish_video(reference_time)
IncidentEngine.finish_video(reference_time)
```

`finish_video()` in the incident engine closes active cases at the video boundary. This is required because offline files have a hard end; an `OPEN` or `COOLDOWN` case must not remain active forever after EOF.

Tracker diagnostics are diagnostic-only. `TrackDiagnosticsAnalyzer` may report suspicious short-term continuity problems, but it never states that two track episodes are the same person. The following counters are allowed:

```text
track_id_switch_suspicions
track_fragmentation_suspicions
track_merge_suspicions
track_split_suspicions
```

These counters help evaluate tracker stability and event-duplication risk.
