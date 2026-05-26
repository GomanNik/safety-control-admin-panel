# Frontend

Frontend-контур административной панели.

## Назначение

`src/` содержит React-приложение для просмотра состояния системы, камер, площадок, проверяемых событий и настроек.

Frontend не выполняет ML-инференс и не принимает решение о нарушении. Он отображает данные, полученные через backend API и realtime-канал.

## Технологии

- React;
- TypeScript;
- Vite;
- React Router;
- TanStack Query;
- Zustand;
- MSW;
- Vitest.

## Структура

```text
src/
├── app/       # приложение: роутинг, layout, providers, mocks
├── entities/  # доменные сущности
├── features/  # пользовательские сценарии
├── pages/     # страницы маршрутов
├── shared/    # общие API, config, realtime, UI, theme, i18n
└── widgets/   # крупные экранные блоки
```

## Основные маршруты

```text
/dashboard
/cameras
/cameras/:cameraId
/incidents
/incidents/:incidentId
/settings
/sites/create
/sites/:siteId
/sites/:siteId/edit
```

`/sites` перенаправляется на `/dashboard`, но страницы создания, просмотра и редактирования площадки остаются доступны прямыми маршрутами.

## Сущности

```text
src/entities/address-registry/
src/entities/camera/
src/entities/incident/
src/entities/site/
```

Каждая сущность может содержать:

- `api.ts`;
- `hooks.ts`;
- `types.ts`;
- `mappers.ts`;
- `model.ts`;
- `formatters.ts`;
- store-слой, если нужен локальный state.

## Features

`features/` описывает прикладные действия и сценарии, например:

- создание камеры;
- удаление камеры;
- фильтрация камер;
- таблица камер;
- realtime-обновления камеры;
- фильтрация событий;
- таблица событий;
- формы площадок.

## Widgets

`widgets/` содержит крупные композиционные блоки экранов:

- dashboard;
- camera details;
- cameras workspace;
- incident details;
- incidents workspace;
- site form/details;
- settings;
- error widgets.

## Запуск

Из корня репозитория:

```powershell
pnpm install
pnpm dev
```

## Проверка

```powershell
pnpm typecheck
pnpm build
pnpm test
```

## Важные правила

- Не размещать бизнес-логику ML во frontend.
- Не смешивать UI-компоненты и сетевые контракты.
- Сохранять разделение `entities`, `features`, `widgets`, `shared`.
- Realtime-данные нормализовать через shared/entities-слой.
- Не хранить видео и тяжелые assets в `public/`.
