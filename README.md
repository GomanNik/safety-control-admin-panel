# Safety Control Admin Panel

Проект состоит из трех частей:

- frontend — административная панель;
- backend — API, realtime и хранение данных;
- vision/ml — runtime видеоаналитики санитарных головных уборов.

## Структура

```text
src/        frontend
backend/    backend API
vision/     ML/video analytics runtime
docs/       документация
```

## Что не хранится в Git

```text
node_modules
dist/build
.env
.venv
vision/data
vision/datasets
vision/models
vision/runs
vision/_handoff
public/videos
*.pt
*.onnx
*.mp4
```

Модели, датасеты, видео, debug-crop, metrics и processed-video хранятся отдельно.
