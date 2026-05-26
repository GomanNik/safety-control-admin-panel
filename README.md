# Safety Control Admin Panel

Единый монорепозиторий программной системы для контроля санитарных головных уборов по архивным видеозаписям.

Проект объединяет три функциональных контура:

- `src/` — frontend административной панели;
- `backend/` — серверная часть, REST API, realtime и работа с данными;
- `vision/` — сервис видеоаналитики для offline-обработки видео;
- `docs/` — общая проектная и эксплуатационная документация.

## Назначение системы

Система предназначена для обработки видеозаписей производственной зоны и формирования проверяемых событий возможного нарушения санитарных требований к головному убору.

Важная граница ответственности: проект не выполняет персональную идентификацию сотрудников. Видеоаналитика работает с временными треками и эпизодами треков в пределах одной обработки видео.

## Общая схема работы

```text
архивное видео
    ↓
vision runtime
    ↓
поиск человека → сопровождение трека → выделение ROI головы
    ↓
проверка качества наблюдения
    ↓
классификация головного убора
    ↓
временная агрегация сигналов
    ↓
проверяемое событие возможного нарушения + evidence
    ↓
backend API / realtime
    ↓
frontend административной панели
```

## Структура репозитория

```text
.
├── backend/      # Express/TypeScript backend: API, realtime, доменные модули
├── docs/         # общая документация проекта
├── public/       # публичные frontend-ресурсы
├── scripts/      # служебные скрипты аудита и анализа frontend-кода
├── src/          # React frontend административной панели
├── vision/       # FastAPI/Python runtime видеоаналитики
├── .env.example  # пример переменных окружения frontend
├── package.json  # frontend package config
└── pnpm-lock.yaml
```

## Основные технологии

### Frontend

- React;
- TypeScript;
- Vite;
- React Router;
- TanStack Query;
- Zustand;
- Vitest;
- MSW для mock-режима.

### Backend

- Node.js;
- Express;
- TypeScript;
- PostgreSQL client;
- WebSocket;
- Zod;
- dotenv.

### Vision runtime

- Python;
- FastAPI;
- OpenCV;
- Ultralytics;
- ONNX Runtime;
- NumPy / SciPy;
- pytest.

## Быстрый старт

### Frontend

```powershell
cd "C:\Users\Goman Nikita\Desktop\safety-control-admin-panel"

pnpm install
pnpm dev
```

Проверка frontend:

```powershell
pnpm typecheck
pnpm build
pnpm test
```

### Backend

```powershell
cd "C:\Users\Goman Nikita\Desktop\safety-control-admin-panel\backend"

npm install
npm run dev
```

Проверка backend:

```powershell
npm run typecheck
npm run build
```

### Vision runtime

```powershell
cd "C:\Users\Goman Nikita\Desktop\safety-control-admin-panel\vision"

py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

Проверка Python-кода:

```powershell
python -m compileall -q app run_runtime.py check_video_runtime.py tools
pytest
```

Запуск FastAPI-сервера:

```powershell
python -m uvicorn app.main:app --host 0.0.0.0 --port 8090
```

Запуск обработки через runtime-клиент:

```powershell
python .\run_runtime.py --base-url "http://127.0.0.1:8090" --max-seconds 60 --print-metrics-summary
```

## Что не хранится в Git

В репозиторий не должны попадать:

```text
node_modules/
dist/
build/
coverage/
.env
.env.*
.venv/
vision/data/
vision/datasets/
vision/models/
vision/runs/
vision/_handoff/
public/videos/
*.pt
*.onnx
*.engine
*.mp4
*.avi
*.mov
*.mkv
```

Модели, датасеты, исходные видео, debug-crop, processed-video и временные handoff-архивы хранятся отдельно.

## Документация

Основные документы:

- `docs/README.md` — карта документации;
- `docs/ARCHITECTURE.md` — архитектура системы;
- `docs/RUNBOOK.md` — запуск, проверка и эксплуатационные команды;
- `docs/REPOSITORY_GUIDE.md` — правила работы с репозиторием;
- `docs/CODE_REVIEW_FIRST_PASS.md` — первичный обзор состояния проекта;
- `src/README.md` — frontend-контур;
- `backend/README.md` — backend-контур;
- `vision/README.md` — video analytics runtime.

## Текущее Git-состояние

Рабочая модель репозитория: одна основная ветка `main`.

Старое разделение по веткам `import/frontend`, `import/backend`, `import/vision-ml` больше не используется как рабочая схема. Frontend, backend и vision ведутся в одном монорепозитории.

## Рекомендуемый порядок проверки перед коммитом

```powershell
pnpm typecheck
pnpm build

cd .\backend
npm run typecheck
npm run build

cd ..\vision
python -m compileall -q app run_runtime.py check_video_runtime.py tools
pytest
```

## Статус документации

Документация приведена к единой монорепозиторной логике, но для полного production-уровня еще желательно отдельно описать:

- контракты frontend ↔ backend;
- контракты backend ↔ vision;
- схему данных backend;
- полный список runtime endpoint-ов;
- сценарии демонстрации системы;
- карту моделей, датасетов и внешних артефактов.
