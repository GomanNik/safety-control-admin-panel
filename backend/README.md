# Backend

Backend-контур системы.

## Назначение

`backend/` содержит серверную часть проекта: REST API, realtime/WebSocket, доменные модули и общий HTTP/error foundation.

Backend является связующим слоем между frontend и данными системы. Vision runtime выполняется отдельно и не должен смешиваться с backend-кодом.

## Технологии

- Node.js;
- Express;
- TypeScript;
- PostgreSQL client;
- WebSocket;
- Zod;
- dotenv;
- tsx.

## Структура

```text
backend/
├── src/
│   ├── app.ts        # сборка Express-приложения
│   ├── main.ts       # точка запуска сервера
│   ├── config/       # конфигурация окружения
│   ├── db/           # подключение к БД
│   ├── modules/      # доменные модули
│   ├── realtime/     # WebSocket/realtime
│   └── shared/       # ошибки, HTTP, валидация, утилиты
├── package.json
└── tsconfig.json
```

## Доменные модули

```text
address-registry
camera
day-person
diagnostics
evidence
incident
report
site
vision-runtime
```

Важно: наличие модуля в структуре не всегда означает, что он полностью подключен в runtime. При ревью нужно отдельно проверять:

- есть ли routes;
- зарегистрированы ли routes в `app.ts`;
- есть ли service/repository;
- есть ли реальные обращения из frontend;
- покрыт ли модуль тестами.

## Запуск

```powershell
cd "C:\Users\Goman Nikita\Desktop\safety-control-admin-panel\backend"

npm install
npm run dev
```

## Проверка

```powershell
npm run typecheck
npm run build
```

## Production-запуск

```powershell
npm run build
npm start
```

## Рекомендованные переменные окружения

Актуальные значения нужно сверить с `src/config/env.ts`.

Типовой набор:

```text
APP_ENV=
PORT=
API_BASE_PATH=
CORS_ORIGINS=
JSON_BODY_LIMIT=
DATABASE_URL=
REALTIME_ENABLED=
REALTIME_PATH=
```

## Границы ответственности

Backend должен:

- принимать и отдавать структурированные данные;
- валидировать входные запросы;
- управлять server-side ошибками;
- обеспечивать API и realtime;
- связывать frontend с backend data model;
- интегрироваться с vision runtime на уровне API/данных.

Backend не должен:

- выполнять CV inference;
- хранить ML-модели в Git;
- читать видео покадрово;
- дублировать логику `vision/app/pipeline`.

## Точки для дальнейшего аудита

- проверить, какие routes реально подключены в `app.ts`;
- описать все backend endpoints;
- добавить `backend/.env.example`;
- добавить интеграционные тесты API;
- синхронизировать backend contracts с frontend entities;
- отдельно описать realtime-события.
