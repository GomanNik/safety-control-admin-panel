# Scripts

Каталог служебных скриптов проекта.

## Назначение

`scripts/` содержит вспомогательные инструменты для аудита, анализа и контроля качества frontend-кода.

Скрипты не являются runtime-частью приложения. Они нужны для сопровождения проекта, анализа структуры и подготовки отчетов о качестве.

## Примеры файлов

```text
analyze-product-usage.ts
collect-frontend-audit-dump.ps1
collect-frontend-quality-report.ps1
extract-api-endpoints.ts
find-i18n-locale-sensitive-files.ps1
run-frontend-audit.ps1
```

## Правила

- Не смешивать служебные audit-скрипты с production-кодом frontend.
- Не коммитить результаты дампов, архивы и временные отчеты.
- Если скрипт становится частью регулярной проверки, добавить его в документацию или package scripts.
