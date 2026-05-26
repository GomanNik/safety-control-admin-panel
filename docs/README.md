# Документация проекта

Этот каталог содержит общую документацию монорепозитория `safety-control-admin-panel`.

## Карта документов

```text
docs/
├── README.md                 # карта документации
├── ARCHITECTURE.md           # общая архитектура системы
├── RUNBOOK.md                # команды запуска и проверки
├── REPOSITORY_GUIDE.md       # правила работы с Git и структурой репозитория
├── CODE_REVIEW_FIRST_PASS.md # первичное ревью текущего состояния
└── DOCUMENTATION_PLAN.md     # план развития документации
```

Дополнительная документация по подсистемам:

```text
src/README.md        # frontend административной панели
backend/README.md    # backend API и realtime
vision/README.md     # runtime видеоаналитики
vision/docs/         # подробные документы по computer vision pipeline
```

## Краткое описание системы

Проект реализован как единый монорепозиторий. Внутри него выделены три контура:

- frontend-контур — интерфейс администратора для просмотра площадок, камер, событий и состояния системы;
- backend-контур — API, realtime, серверная бизнес-логика и работа с данными;
- vision-контур — offline-видеоаналитика для обработки архивных видеозаписей.

## Главная логика обработки

```text
video source
    ↓
person detection / tracking
    ↓
track episode
    ↓
head ROI
    ↓
quality gate
    ↓
headwear classification
    ↓
temporal aggregation
    ↓
verifiable event
    ↓
evidence + API response
```

## Важные ограничения

Система не должна описываться как система персональной идентификации сотрудников.

Корректная формулировка:

> Система формирует проверяемые события возможного нарушения на основе временных эпизодов треков в пределах обработки видеозаписи.

Некорректная формулировка:

> Система распознает сотрудника и фиксирует нарушение за конкретным человеком.

## Что считать источником истины

Для общей структуры проекта:

- корневой `README.md`;
- `docs/ARCHITECTURE.md`;
- `docs/RUNBOOK.md`.

Для frontend:

- `src/README.md`;
- `src/app/router/routes.tsx`;
- `src/entities/*`;
- `src/features/*`;
- `src/widgets/*`.

Для backend:

- `backend/README.md`;
- `backend/src/app.ts`;
- `backend/src/modules/*`;
- `backend/src/shared/*`.

Для vision:

- `vision/README.md`;
- `vision/docs/ARCHITECTURE_MAP.md`;
- `vision/docs/TARGET_LOGIC.md`;
- `vision/app/pipeline/runtime.py`;
- `vision/app/api/routes_runtime.py`.

## Рекомендуемый порядок чтения

1. `README.md`
2. `docs/ARCHITECTURE.md`
3. `docs/RUNBOOK.md`
4. `src/README.md`
5. `backend/README.md`
6. `vision/README.md`
7. `vision/docs/ARCHITECTURE_MAP.md`
8. `vision/docs/TARGET_LOGIC.md`
