# HEADWEAR_MODEL_REBUILD_PLAN

## 1. Зачем перестраивать модель

Текущий runtime анализирует не полный кадр, а ROI головы, построенный из bbox человека. Поэтому модель санитарного головного убора должна обучаться и проверяться на данных, похожих на реальные runtime-входы:

```text
person bbox -> head_bbox/head crop -> classifier input
```

Главная цель модели — не просто отличать “шапка/не шапка” на чистых картинках, а устойчиво работать на crops из видеонаблюдения:

- разная освещенность;
- размытие;
- повороты;
- частичное перекрытие;
- маленький ROI;
- производственный фон;
- несколько людей в кадре;
- неинформативные crops.

---

## 2. Целевая постановка v1

Рекомендуемая постановка — многоклассовая классификация ROI головы:

```text
allowed_sanitary_headwear
non_sanitary_headwear
unknown_unusable
```

### `allowed_sanitary_headwear`

Разрешенный санитарный головной убор виден достаточно надежно.

### `non_sanitary_headwear`

Головной убор отсутствует или явно не соответствует санитарному требованию.

### `unknown_unusable`

ROI не позволяет надежно принять решение:

- голова не видна;
- сильное размытие;
- пересвет/темнота;
- сильное перекрытие;
- человек отвернут;
- crop слишком маленький;
- crop захватил не голову;
- виден только фрагмент тела;
- кадр неинформативен.

`unknown_unusable` нужен для снижения ложных нарушений.

---

## 3. Главный критерий качества

Модель должна минимизировать ложные `VIOLATION` на плохих ROI.

Приоритет решений:

```text
плохой ROI -> UNKNOWN
неуверенный результат -> UNKNOWN
надежный разрешенный головной убор -> COMPLIANT
надежное отсутствие/нарушение -> VIOLATION
```

Для production-flow лучше пропустить сомнительный кадр, чем создать ложное санитарное событие.

---

## 4. Данные

Источники данных:

1. реальные crops из текущего runtime/video mining;
2. ранее подготовленный headwear dataset;
3. ручная разметка review sheets;
4. debug crops после runtime-прогона;
5. test_real, собранный из видео, не попавших в train.

Важно: train/val/test должны быть разделены так, чтобы одинаковые или почти одинаковые кадры одного участка видео не протекали между split.

---

## 5. Структура датасета

Рекомендуемая структура:

```text
datasets/headwear_policy_v1/
  train/
    allowed_sanitary_headwear/
    non_sanitary_headwear/
    unknown_unusable/
  val/
    allowed_sanitary_headwear/
    non_sanitary_headwear/
    unknown_unusable/
  test_real/
    allowed_sanitary_headwear/
    non_sanitary_headwear/
    unknown_unusable/
  metadata.csv
```

`metadata.csv` должен по возможности хранить:

- sample_id;
- source_video;
- frame_index;
- timestamp_seconds;
- person bbox;
- head crop bbox;
- crop path;
- quality hints;
- final_class;
- split;
- comment.

---

## 6. Pipeline работ

### 6.1. Собрать реальные crops

Использовать video mining scripts:

```powershell
scripts\headwear\09_scan_video_people.ps1
scripts\headwear\10_extract_crops_from_video.ps1
scripts\headwear\13_filter_mined_crops_quality.ps1
scripts\headwear\14_make_sheet_labeling_batches.ps1
scripts\headwear\15_apply_sheet_labels.ps1
```

Цель — получить crops, похожие на то, что увидит runtime.

### 6.2. Разметить классы

Разметка должна быть строгой:

- сомнительные ROI не размечать как violation;
- плохие ROI отправлять в `unknown_unusable`;
- не подменять санитарную задачу задачей качества кадра;
- не включать full frame как classifier input.

### 6.3. Подготовить split

Проверить:

- нет дублей между train/val/test;
- test_real содержит реальные сложные случаи;
- классы не сильно перекошены;
- `unknown_unusable` представлен достаточно широко.

### 6.4. Обучить classifier

Использовать:

```powershell
scripts\headwear\03_train_classifier.ps1
```

Минимально сохранять:

- model weights;
- class order;
- training config;
- metrics;
- confusion matrix;
- ошибочные examples.

### 6.5. Экспортировать ONNX

Использовать:

```powershell
scripts\headwear\04_export_onnx.ps1
```

После экспорта зафиксировать:

- input width/height;
- normalization mode;
- class order;
- output shape;
- expected labels.

### 6.6. Проверить ONNX на debug crops

Использовать:

```powershell
scripts\headwear\06_verify_onnx_on_debug_crops.ps1
```

Проверить, что:

- runtime preprocessing совпадает с training preprocessing;
- class mapping совпадает;
- плохие crops дают `UNKNOWN`;
- confident violations действительно визуально проверяемы.

### 6.7. Оценить на test_real

Использовать:

```powershell
scripts\headwear\05_evaluate_real_test.ps1
```

Смотреть не только accuracy, но и:

- macro-F1;
- precision/recall по `non_sanitary_headwear`;
- confusion `unknown_unusable` vs violation;
- false violation examples;
- качество на ночных/темных/размытых сценах.

---

## 7. Runtime внедрение

Runtime должен получать настройки модели через env:

```text
HEADWEAR_DETECTOR_MODE=onnx
HEADWEAR_MODEL_PATH=...
HEADWEAR_INPUT_WIDTH=...
HEADWEAR_INPUT_HEIGHT=...
HEADWEAR_INPUT_NORMALIZATION_MODE=...
HEADWEAR_CLASS_NAMES=allowed_sanitary_headwear,non_sanitary_headwear,unknown_unusable
HEADWEAR_COMPLIANT_LABELS=allowed_sanitary_headwear
HEADWEAR_VIOLATION_LABELS=non_sanitary_headwear
HEADWEAR_UNKNOWN_LABELS=unknown_unusable
HEADWEAR_CLASSIFIER_CONF_THRESHOLD=...
HEADWEAR_CLASSIFIER_MARGIN=...
```

После переключения:

```powershell
python -m compileall -q app run_runtime.py check_video_runtime.py tools
python tools\check_requirements.py
```

Затем короткий offline export на известном видео.

---

## 8. Что не делать

Нельзя:

- обучать classifier на full frame, если runtime подает ROI головы;
- размечать плохие/мутные crops как violation;
- снижать threshold как единственное решение;
- игнорировать class order при ONNX export;
- включать модель в incidents без проверки на test_real;
- использовать headwear result как identity-признак;
- считать единичный кадр событием нарушения.

---

## 9. Acceptance criteria перед включением incidents

Перед тем как включать `HEADWEAR_INCIDENTS_ENABLED=True`, нужно:

1. Проверить ONNX на реальных debug crops.
2. Проверить confusion matrix на `test_real`.
3. Убедиться, что false violation rate приемлем.
4. Убедиться, что `unknown_unusable` не схлопывается в violation.
5. Прогнать offline video export и визуально проверить evidence.
6. Проверить, что один кадр не открывает `OPEN` incident.
7. Проверить, что evidence содержит head crop.
8. Проверить, что `track_episode_id` есть в incidents/evidence.
