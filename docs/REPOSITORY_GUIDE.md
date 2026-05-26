# Работа с репозиторием

## Рабочая модель Git

Проект ведется как единый монорепозиторий.

Основная ветка:

```text
main
```

Старое разделение на ветки вида `import/frontend`, `import/backend`, `import/vision-ml` больше не используется как рабочая схема.

## Рекомендуемый рабочий процесс

Перед началом работы:

```powershell
git switch main
git pull --ff-only origin main
git status
```

Перед коммитом:

```powershell
git status --short
```

Для обычной доработки:

```powershell
git add -A
git commit -m "docs: update project documentation"
git push origin main
```

Для рискованных изменений лучше создавать временную ветку:

```powershell
git switch -c work/<short-task-name>
```

После проверки изменения можно влить в `main`.

## Формат коммитов

Рекомендуемые префиксы:

```text
feat:     новая функциональность
fix:      исправление ошибки
docs:     документация
refactor: рефакторинг без изменения поведения
test:     тесты
chore:    инфраструктура, зависимости, служебные изменения
```

Примеры:

```text
docs: update repository documentation
fix: handle runtime start offset for person crop collection
refactor: separate headwear observation mapping
test: add runtime start seconds coverage
```

## Что нельзя коммитить

```text
.env
.env.*
node_modules/
dist/
build/
coverage/
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
*.zip
*.7z
*.rar
```

Исключение:

```text
.env.example
**/.env.example
```

## Проверка состояния Git

```powershell
git status
git branch -vv
git log --oneline --decorate --graph --all -n 40
```

Нормальное состояние:

```text
On branch main
Your branch is up to date with 'origin/main'.
nothing to commit, working tree clean
```

## Если появились незакоммиченные изменения

Посмотреть список:

```powershell
git status --short
```

Сохранить в коммит:

```powershell
git add -A
git commit -m "chore: save current project state"
```

Отменять изменения через `git reset --hard` можно только если точно понятно, что эти изменения не нужны.

## Если нужно создать страховочную ветку

```powershell
$Now = Get-Date -Format "yyyyMMdd-HHmmss"
$Branch = "backup/local-state-$Now"

git switch -c $Branch
git add -A
git commit -m "backup: save local project state"
git push -u origin $Branch
```

## Правило по документации

Если меняется архитектура, runtime flow, API-контракт или структура каталогов, нужно обновить минимум один из документов:

- `README.md`;
- `docs/ARCHITECTURE.md`;
- `docs/RUNBOOK.md`;
- `src/README.md`;
- `backend/README.md`;
- `vision/README.md`;
- `vision/docs/ARCHITECTURE_MAP.md`;
- `vision/docs/TARGET_LOGIC.md`.
