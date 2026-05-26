# Runbook

Документ содержит основные команды запуска, проверки и диагностики проекта.

## Предварительные требования

- Windows + PowerShell;
- Node.js;
- pnpm;
- Python;
- Git;
- доступ к внешним моделям/датасетам/видео вне Git-репозитория;
- при необходимости — PostgreSQL для backend.

## Проверка репозитория

```powershell
cd "C:\Users\Goman Nikita\Desktop\safety-control-admin-panel"

git switch main
git pull --ff-only origin main
git status
```

Ожидаемое состояние:

```text
On branch main
Your branch is up to date with 'origin/main'.
nothing to commit, working tree clean
```

## Frontend

Рабочая директория:

```powershell
cd "C:\Users\Goman Nikita\Desktop\safety-control-admin-panel"
```

Установка зависимостей:

```powershell
pnpm install
```

Запуск dev-сервера:

```powershell
pnpm dev
```

Проверка типов:

```powershell
pnpm typecheck
```

Production build:

```powershell
pnpm build
```

Тесты:

```powershell
pnpm test
```

## Backend

Рабочая директория:

```powershell
cd "C:\Users\Goman Nikita\Desktop\safety-control-admin-panel\backend"
```

Установка зависимостей:

```powershell
npm install
```

Запуск dev-сервера:

```powershell
npm run dev
```

Проверка типов:

```powershell
npm run typecheck
```

Сборка:

```powershell
npm run build
```

Production-запуск после сборки:

```powershell
npm start
```

## Vision runtime

Рабочая директория:

```powershell
cd "C:\Users\Goman Nikita\Desktop\safety-control-admin-panel\vision"
```

Создание виртуального окружения:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
```

Установка зависимостей:

```powershell
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

Быстрая проверка синтаксиса:

```powershell
python -m compileall -q app run_runtime.py check_video_runtime.py tools
```

Тесты:

```powershell
pytest
```

Запуск FastAPI:

```powershell
python -m uvicorn app.main:app --host 0.0.0.0 --port 8090
```

Запуск обработки через клиент:

```powershell
python .\run_runtime.py --base-url "http://127.0.0.1:8090" --max-seconds 60 --print-metrics-summary
```

Сбор person crops с указанного времени видео:

```powershell
python .\run_runtime.py `
  --collect-person-crops `
  --source-url "<path-to-video>" `
  --output-dir "<output-dir>" `
  --start-seconds 3600
```

## Проверка перед отправкой проекта

Из корня проекта:

```powershell
pnpm typecheck
pnpm build
```

Backend:

```powershell
cd .\backend
npm run typecheck
npm run build
```

Vision:

```powershell
cd ..\vision
python -m compileall -q app run_runtime.py check_video_runtime.py tools
pytest
```

## Типичные проблемы

### Не найден Python-пакет

Проверить активное окружение:

```powershell
Get-Command python
python -m pip list
```

### Ошибка из-за отсутствия модели

Модели не хранятся в Git. Нужно проверить путь к модели в `.env`, runtime settings или документации конкретного эксперимента.

### Ошибка из-за отсутствия видео

Исходные видео не хранятся в Git. Нужно указать локальный `source-url` или путь к доступному файлу.

### Git показывает много generated files

Проверить `.gitignore`. В Git не должны попадать `vision/data`, `vision/datasets`, `vision/models`, `vision/runs`, видео, веса моделей и handoff-архивы.
