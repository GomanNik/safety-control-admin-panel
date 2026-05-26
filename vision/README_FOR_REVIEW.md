# Runtime person crop collection bundle

Цель правки:
- временный режим сбора датасета из большого видео;
- без трекинга;
- без incident/event logic;
- без headwear classifier;
- без отрисовки bbox и подписей;
- без сохранения export-video;
- сохранять только:
  - clean frame;
  - clean person crop;
  - manifest.csv с bbox и метаданными.

Нельзя:
- трогать data/datasets/runs/models/.venv;
- обучать модели;
- скачивать модели;
- писать новый отдельный pipeline с нуля, если можно использовать существующий runtime-код.

Главные файлы для анализа:
- app/pipeline/runtime.py
- app/pipeline/person_box_gate.py
- app/storage/frame_store.py
- app/api/routes_runtime.py
- app/config.py
- run_runtime.py
