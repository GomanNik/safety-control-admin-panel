# Runtime notes

## Vision runtime

Рабочая директория:

```text
vision/
```

Проверка:

```powershell
python -m compileall -q app run_runtime.py check_video_runtime.py tools
```

Запуск сервера:

```powershell
python -m uvicorn app.main:app --host 0.0.0.0 --port 8090
```

Запуск обработки:

```powershell
python .\run_runtime.py --base-url "http://127.0.0.1:8090" --max-seconds 60 --print-metrics-summary
```
