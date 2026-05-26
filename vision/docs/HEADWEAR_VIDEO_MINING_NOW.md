# HEADWEAR_VIDEO_MINING_NOW

## Назначение

Документ описывает практический порядок добычи реальных samples из больших скачанных видео для обучения и проверки модели санитарного головного убора.

Цель video mining — получить crops, похожие на реальные входы текущего runtime:

```text
person detection/tracking -> person bbox -> head crop -> classifier input
```

---

## 1. Скан видео на наличие людей

Скрипт:

```powershell
scripts\headwear\09_scan_video_people.ps1
```

Назначение:

- пройти большое видео с заданным шагом;
- найти кадры, где есть люди;
- не сохранять весь поток;
- подготовить список кандидатов для crop extraction.

Пример запуска:

```powershell
$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0
$ProgressPreference = "SilentlyContinue"

.\scripts\headwear\09_scan_video_people.ps1 `
  -Video "C:\path\to\video.mp4" `
  -PersonModel "C:\path\to\person_model.pt" `
  -Device "cpu" `
  -SampleSeconds 2 `
  -PersonConf 0.20
```

---

## 2. Извлечение crops

Скрипт:

```powershell
scripts\headwear\10_extract_crops_from_video.ps1
```

Назначение:

- извлечь person/head crops;
- сохранить metadata;
- сохранить frame context при необходимости;
- подготовить материал для фильтрации и ручной разметки.

Пример:

```powershell
.\scripts\headwear\10_extract_crops_from_video.ps1 `
  -Video "C:\path\to\video.mp4" `
  -PersonModel "C:\path\to\person_model.pt" `
  -Device "cpu" `
  -SampleSeconds 2 `
  -PersonConf 0.20 `
  -MaxCrops 20000 `
  -SaveFrameContext
```

Ожидаемые артефакты:

```text
crops/
metadata.csv
input previews
frame context
```

---

## 3. Фильтрация качества

Скрипт:

```powershell
scripts\headwear\13_filter_mined_crops_quality.ps1
```

Назначение:

- убрать слишком маленькие crops;
- убрать слишком темные/пересвеченные;
- пометить размытые;
- подготовить review subset.

Важно: фильтрация не должна удалять все сложные случаи. Часть плохих ROI нужна для класса `unknown_unusable`.

---

## 4. Review sheets для ручной разметки

Скрипт:

```powershell
scripts\headwear\14_make_sheet_labeling_batches.ps1
```

Назначение:

- собрать contact sheets;
- дать каждому crop понятный review_id;
- ускорить ручную разметку.

Рекомендуемые классы:

```text
allowed_sanitary_headwear
non_sanitary_headwear
unknown_unusable
```

Правило разметки:

```text
сомнительный ROI -> unknown_unusable
```

---

## 5. Применение разметки

Скрипт:

```powershell
scripts\headwear\15_apply_sheet_labels.ps1
```

Назначение:

- применить labels к metadata;
- разложить samples по классам;
- подготовить train/val/test или общий labeled pool.

---

## 6. Практический режим

Для большого видео не нужно сразу извлекать все кадры.

Рациональный порядок:

1. просканировать видео с шагом 2–5 секунд;
2. извлечь ограниченный batch crops;
3. сделать review sheets;
4. разметить 500–2000 samples;
5. проверить распределение классов;
6. расширять dataset только после проверки качества.

---

## 7. Что отправлять на анализ

Не нужно отправлять большое исходное видео.

Полезно отправлять:

```text
metadata.csv
class_counts.csv
несколько contact sheet jpg
50-100 спорных crops zip
примеры false violation / false compliant
```

Так можно оценить качество данных и стратегию разметки без передачи всего видео.

---

## 8. Связь с runtime

После обучения и экспорта ONNX модель нужно проверять на crops, которые реально получает runtime.

Проверки:

- head crop соответствует ожидаемому ROI;
- плохие ROI дают `UNKNOWN`;
- class order совпадает с env;
- модель не создает массовые false violation;
- incidents открываются только после temporal aggregation.
