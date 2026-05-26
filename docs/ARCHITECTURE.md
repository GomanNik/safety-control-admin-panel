# Архитектура проекта

## Общая характеристика

`safety-control-admin-panel` — монорепозиторий программной системы для обработки архивных видеозаписей и работы с результатами видеоаналитики.

Система состоит из трех контуров:

```text
frontend  <->  backend  <->  vision runtime
```

При этом Git-структура единая: все контуры ведутся в ветке `main`.

## Архитектурная схема

```text
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                              │
│  React / TypeScript / Vite                                  │
│  Dashboard, Cameras, Incidents, Settings                    │
└───────────────────────────────┬─────────────────────────────┘
                                │ REST / WebSocket
┌───────────────────────────────▼─────────────────────────────┐
│                         Backend                              │
│  Express / TypeScript                                       │
│  API, realtime, domain modules, data access                  │
└───────────────────────────────┬─────────────────────────────┘
                                │ runtime integration
┌───────────────────────────────▼─────────────────────────────┐
│                       Vision runtime                         │
│  FastAPI / OpenCV / ML inference                             │
│  Offline video processing, events, evidence                  │
└─────────────────────────────────────────────────────────────┘
```

## Frontend

Папка:

```text
src/
```

Назначение:

- административная панель;
- отображение dashboard;
- работа с площадками, камерами и событиями;
- запросы к backend API;
- realtime-подписки;
- локальные mock-данные для разработки;
- UI-kit, тема, foundation styles.

Ключевые слои:

```text
src/app/       # инициализация приложения, роутинг, провайдеры
src/entities/  # доменные сущности: camera, incident, site, address-registry
src/features/  # пользовательские сценарии и операции
src/widgets/   # крупные экранные блоки
src/shared/    # API-клиент, конфиг, i18n, realtime, UI, theme
src/pages/     # страницы маршрутов
```

## Backend

Папка:

```text
backend/
```

Назначение:

- REST API;
- realtime/WebSocket;
- серверные доменные модули;
- валидация входных данных;
- единый формат ответов и ошибок;
- интеграция с внешними компонентами;
- слой доступа к данным.

Ключевые слои:

```text
backend/src/app.ts           # сборка Express-приложения
backend/src/main.ts          # точка запуска backend
backend/src/config/          # переменные окружения
backend/src/modules/         # доменные модули
backend/src/shared/          # ошибки, HTTP, утилиты
backend/src/realtime/        # WebSocket/realtime
backend/src/db/              # подключение к БД
```

## Vision runtime

Папка:

```text
vision/
```

Назначение:

- offline-обработка видео;
- поиск и сопровождение людей;
- выделение ROI головы;
- оценка качества наблюдения;
- классификация состояния головного убора;
- временная агрегация покадровых сигналов;
- формирование проверяемых событий;
- сохранение evidence;
- экспорт обработанного видео;
- диагностические и dataset-скрипты.

Ключевая production-цепочка:

```text
app/main.py
  -> app/api/routes_runtime.py
  -> app/pipeline/runtime.py
  -> app/pipeline/person_tracking_engine.py
  -> app/pipeline/quality_gate.py
  -> app/pipeline/track_episode_registry.py
  -> app/pipeline/human_observation.py
  -> app/pipeline/headwear_detector.py
  -> app/pipeline/incident_engine.py
  -> app/storage/frame_store.py
  -> app/models/schemas.py
```

## Границы ответственности

### Frontend не должен

- принимать ML-решения;
- самостоятельно вычислять нарушение;
- подменять backend/vision-статусы;
- хранить тяжелые видео и модели.

### Backend не должен

- выполнять CV inference;
- читать исходное видео покадрово;
- хранить модельные веса в Git;
- превращаться в дублирующий vision pipeline.

### Vision runtime не должен

- выполнять персональную идентификацию сотрудников;
- хранить датасеты и модели в Git;
- зависеть от frontend;
- смешивать временный `track_episode_id` с личностью человека.

## Ключевые сущности

### Site

Производственная площадка или зона, к которой относятся камеры и события.

### Camera

Камера или видеоисточник, по которому выполняется просмотр и обработка.

### Track episode

Временный эпизод трека внутри одной обработки видео. Не является персональной идентификацией.

### Head ROI

Область головы/головного убора, выделенная из bbox человека.

### Observation

Наблюдение одного track episode на конкретном кадре.

### Incident / Verifiable event

Проверяемое событие возможного нарушения, сформированное не по одному кадру, а на основе временной агрегации сигналов.

### Evidence

Визуальные и диагностические материалы, позволяющие проверить событие.

## Основной архитектурный риск

Главный риск проекта — смешивание экспериментальных dataset/debug-инструментов с production runtime. Поэтому документация и код должны явно отделять:

- production path;
- offline/debug tools;
- dataset preparation tools;
- временные research-скрипты.
