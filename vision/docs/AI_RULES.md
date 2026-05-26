# AI_RULES

## Назначение документа

Этот документ фиксирует правила работы с текущей версией проекта `vision`.

Текущий проект — это **offline track-centric video processing service** для обработки заранее скачанных видео. На этом этапе не требуется полноценный online runtime с постоянным подключением к камере, reconnect, live preview и управляемым live start/stop.

Главная цель текущей версии:

```text
скачанное видео
-> обработка кадров
-> детекция/трекинг людей
-> формирование track episode
-> ROI головы
-> quality gate
-> headwear classification
-> temporal aggregation
-> evidence
-> API/status/export result
```

---

## Главные правила работы с проектом

1. Не возвращать старую identity/day-person архитектуру под новыми названиями.
2. Не использовать `track_id` как стабильный идентификатор человека.
3. Не создавать `person_id`, `day_person_id`, `person_001` и похожие сущности в production-flow.
4. Использовать `track_episode_id` как временный идентификатор эпизода трека внутри одной offline-обработки видео.
5. Понимать, что `track_episode_id` не является персональной идентификацией и не доказывает, что объект после повторного появления — тот же человек.
6. Не открывать санитарное событие по одному кадру.
7. Не усиливать санитарное событие неинформативными ROI.
8. Не отправлять полный кадр в headwear classifier вместо ROI головы.
9. Не считать плохой ROI подтверждением нарушения.
10. Не смешивать технические проблемы видеопотока с санитарными событиями.
11. Не сохранять evidence на каждый кадр без политики ограничения.
12. Runtime должен быть оркестратором offline-обработки, а не identity-движком.
13. Все новые Python-файлы должны иметь header-комментарий.
14. После правок проект должен проходить `compileall`.
15. После чистки кода проект должен проходить `ruff`.
16. Если меняется контракт observation/event/status, нужно обновлять документацию и contract tests.

---

## Источник истины

Основные документы:

- `docs/TARGET_LOGIC.md` — целевая логика обработки видео;
- `docs/ARCHITECTURE_MAP.md` — карта модулей проекта;
- `docs/REQUIREMENTS_MATRIX.md` — требования и проверяемые контракты;
- `docs/DEVELOPMENT_PLAN.md` — порядок дальнейшей доработки;
- `tools/check_requirements.py` — легкая статическая проверка архитектурных ожиданий.

Кодовые источники истины:

- `app/pipeline/runtime.py`;
- `app/pipeline/person_tracking_engine.py`;
- `app/pipeline/track_episode_registry.py`;
- `app/pipeline/human_observation.py`;
- `app/pipeline/quality_gate.py`;
- `app/pipeline/headwear_detector.py`;
- `app/pipeline/incident_engine.py`;
- `app/storage/frame_store.py`;
- `app/models/schemas.py`;
- `app/api/routes_runtime.py`.

---

## Текущая production-цепочка

```text
VisionRuntimeService.export_processed_video
-> cv2.VideoCapture
-> PersonTrackingEngine.process_frame
-> TrackingFrameResult
-> QualityGate.assess
-> TrackEpisodeRegistry.update_frame
-> build_track_observation_from_tracking
-> TrackObservation
-> HeadwearDetector.assess_observation
-> IncidentEngine.process_headwear_assessment
-> FrameStore.save_incident_evidence
-> RuntimeStatus / Tracks / Incidents API
```

---

## Разделение ответственности

### `VisionRuntimeService`

Должен:

- запускать offline export видео;
- открывать видеоисточник;
- читать кадры;
- решать, какие кадры анализировать;
- вызывать tracking, quality, observation, headwear, incident, evidence;
- собирать runtime stats;
- писать обработанное видео, если это включено;
- отдавать status/tracks/incidents через API.

Не должен:

- выполнять персональную идентификацию;
- напрямую решать санитарное событие в обход `IncidentEngine`;
- передавать full frame в classifier как объект классификации;
- возвращать старую day-person логику.

### `PersonTrackingEngine`

Должен:

- работать как adapter над внешним tracking backend;
- использовать `model.track(...)` для детекции и сопровождения людей;
- возвращать временный внешний `track_id`;
- возвращать bbox, confidence, состояние трека и diagnostics;
- фильтровать только людей.

Не должен:

- создавать стабильного человека;
- назначать `person_id`;
- проверять головной убор;
- создавать санитарные события;
- выполнять ReID или appearance matching.

### `QualityGate`

Должен:

- оценивать геометрию bbox;
- оценивать размер bbox и area ratio;
- оценивать crop/truncation;
- оценивать occlusion;
- оценивать видимость головы;
- оценивать blur/exposure, если передан frame;
- выставлять `is_usable_for_tracking` и `is_usable_for_headwear`;
- возвращать полный `QualityAssessment`.

Не должен:

- назначать identity;
- проверять headwear;
- открывать событие;
- создавать evidence.

### `TrackEpisodeRegistry`

Должен:

- превращать внешний `track_id` в явный `track_episode_id`;
- создавать episode только после минимальной устойчивости и качества;
- подавлять partial/fragment tracks до promotion;
- вести статусы `ACTIVE`, `LOST_RECENTLY`, `ENDED`;
- накапливать счетчики качества/headwear/evidence по episode;
- отдавать snapshot для `/runtime/tracks` и `/runtime/track-episodes`.

Не должен:

- утверждать, что два разных track episode — один и тот же человек;
- сравнивать внешность людей;
- использовать цвет одежды, силуэт, лицо или headwear как identity-признак;
- создавать `person_001`.

### `TrackObservation`

Должен:

- быть переносчиком данных между tracking/quality/episode и headwear/incident;
- хранить `track_episode_id`, `source_track_id`, bbox, `head_bbox`, quality, visible parts, reason codes;
- давать безопасные флаги `is_usable_for_headwear` и `is_usable_for_incident`;
- сохранять compatibility alias `HumanObservation`, если он нужен старым вызовам.

Не должен:

- выполнять identity scoring;
- открывать incident;
- менять качество;
- менять `track_episode_id`.

### `HeadwearDetector`

Должен:

- принимать `TrackObservation` через `assess_observation(...)`;
- извлекать и классифицировать ROI головы;
- возвращать `COMPLIANT`, `VIOLATION` или `UNKNOWN`;
- возвращать confidence, label, reason, reason_codes и raw_scores;
- безопасно деградировать в `UNKNOWN` при плохом ROI или ошибке модели.

Не должен:

- классифицировать полный кадр как объект headwear;
- создавать incident;
- участвовать в identity;
- менять episode assignment.

### `IncidentEngine`

Должен:

- работать по `track_episode_id`;
- агрегировать сигналы во временном окне;
- не открывать `OPEN` по одному кадру;
- игнорировать `UNKNOWN` как подтверждение нарушения;
- учитывать usable quality/confidence;
- переводить событие между `CANDIDATE`, `OPEN`, `COOLDOWN`, `CLOSED`;
- отдавать changed cases для API/backend/evidence.

Не должен:

- создавать identity;
- исправлять tracking;
- принимать неинформативный кадр как нарушение;
- создавать evidence напрямую.

### `FrameStore`

Должен:

- сохранять evidence только для релевантных событий;
- связывать evidence с `case_id` и `track_episode_id`;
- сохранять full frame/person crop/head crop/metadata;
- безопасно обрабатывать ошибки записи.

Не должен:

- писать весь поток без ограничения как evidence;
- сохранять мусорные кадры как подтверждение;
- смешивать debug crops и production evidence.

---

## Deprecated compatibility

В проекте могут оставаться compatibility-слои:

- `HumanObservation = TrackObservation`;
- `/runtime/day-people` как deprecated alias;
- `DayPersonResponse` / `DayPersonRecord` как deprecated aliases к track episode DTO;
- identity-related поля в `RuntimeStats` или `QualityAssessment`, которые всегда должны оставаться неактивными/false.

Эти элементы не являются production-логикой. Их нельзя использовать как основание для возвращения старого day-person pipeline.

---

## Запрещенные действия

Запрещено:

- возвращать `DayPersonRegistry` как обязательный production-компонент;
- добавлять handwritten ReID/identity modules;
- создавать stable person из одного или нескольких bbox без реальной ReID-постановки;
- использовать headwear result как identity-признак;
- открывать `OPEN` incident по одному violation-сигналу;
- усиливать incident по `UNKNOWN`;
- вызывать classifier до quality gate для явно плохого ROI;
- передавать полный кадр в classifier вместо `head_bbox` crop;
- молча включать dev/model fallback в production;
- игнорировать ошибки модели и выдавать их как санитарные события.

---

## Минимальные проверки после изменений

```powershell
python -m ruff check app run_runtime.py check_video_runtime.py tools
python -m vulture app --min-confidence 70
python tools\check_requirements.py
python -m compileall -q app run_runtime.py check_video_runtime.py tools
```

Если добавлены tests:

```powershell
python -m pytest tests -q
```

Если менялся observation/headwear contract:

```powershell
Select-String -Path app\pipeline\*.py,app\models\*.py -Pattern "TrackObservation|HumanObservation|assess_observation|head_bbox"
```

Если менялась документация:

```powershell
python tools\check_requirements.py
```
