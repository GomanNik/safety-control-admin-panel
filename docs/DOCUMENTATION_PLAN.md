# План развития документации

## Цель

Довести документацию проекта до состояния, при котором новый человек может:

- понять назначение системы;
- запустить frontend;
- запустить backend;
- запустить vision runtime;
- понять production flow видеоаналитики;
- отличить production-код от dataset/debug-инструментов;
- проверить проект перед демонстрацией.

## Уже подготовлено в этом пакете

- корневой `README.md`;
- `docs/README.md`;
- обновленный `docs/ARCHITECTURE.md`;
- обновленный `docs/REPOSITORY_GUIDE.md`;
- обновленный `docs/RUNBOOK.md`;
- `docs/CODE_REVIEW_FIRST_PASS.md`;
- `src/README.md`;
- `backend/README.md`;
- `vision/README.md`;
- `scripts/README.md`;
- `vision/docs/README.md`.

## Следующие документы

### 1. API contracts

Файл:

```text
docs/API_CONTRACTS.md
```

Содержание:

- frontend ↔ backend;
- backend ↔ vision;
- формат ошибок;
- формат событий;
- realtime-сообщения.

### 2. Data model

Файл:

```text
docs/DATA_MODEL.md
```

Содержание:

- Site;
- Camera;
- Incident/Event;
- Evidence;
- Track episode;
- Runtime status.

### 3. Demo scenarios

Файл:

```text
docs/DEMO_SCENARIOS.md
```

Содержание:

- запуск frontend;
- запуск backend;
- запуск vision;
- обработка короткого видео;
- просмотр события;
- проверка evidence;
- демонстрация, что система не выполняет персональную идентификацию.

### 4. Vision runtime endpoints

Файл:

```text
vision/docs/RUNTIME_ENDPOINTS.md
```

Содержание:

- `/runtime/status`;
- `/runtime/incidents`;
- `/runtime/tracks`;
- `/runtime/track-episodes`;
- `/runtime/export-video`;
- `/runtime/collect-person-crops`.

### 5. Dataset workflow

Файл:

```text
vision/docs/DATASET_WORKFLOW.md
```

Содержание:

- сбор crop;
- отбор качества;
- annotation packs;
- pseudo-training sets;
- обучение;
- аудит ошибок;
- что хранится вне Git.

## Приоритет

Сейчас самый полезный следующий шаг — `docs/API_CONTRACTS.md`, потому что он свяжет frontend, backend и vision в одну понятную систему.
