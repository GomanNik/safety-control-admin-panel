# Архитектура проекта

## Frontend

Папка:

```text
src/
```

Назначение:

- административная панель;
- камеры, площадки, инциденты;
- realtime-клиент;
- UI-компоненты и тема.

## Backend

Папка:

```text
backend/
```

Назначение:

- REST API;
- WebSocket/realtime;
- модули cameras, incidents, reports, evidence, diagnostics;
- интеграция с vision runtime.

## Vision / ML

Папка:

```text
vision/
```

Назначение:

- person detection / tracking;
- фильтрация person bbox;
- выделение head ROI;
- классификация головного убора;
- temporal aggregation;
- runtime metrics;
- debug/headwear;
- processed-video export.
