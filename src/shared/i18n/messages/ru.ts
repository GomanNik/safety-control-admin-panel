// =====================
// File: src/shared/i18n/messages/ru.ts
// Purpose:
// - Russian UI messages
// - Preserves the full dictionary structure
// - Uses clearer, less bureaucratic wording
// =====================

import type { MessagesDictionary } from '../types';

export const ruMessages: MessagesDictionary = {
    common: {
        pleaseWait: 'Пожалуйста, подождите…',
        notAvailable: '—',
        unknown: 'Неизвестно',
        active: 'Активно',
        inactive: 'Неактивно',
        collapse: 'Свернуть',
        expandMore: 'Показать ещё',
        close: 'Закрыть',
    },

    dashboard: {
        title: 'Обзор системы',
        subtitle: 'Площадки, камеры и инциденты.',

        loading: {
            title: 'Загружаем обзор',
            subtitle: 'Собираем данные по площадкам, камерам и инцидентам.',
        },

        empty: {
            title: 'Пока нечего показывать',
            subtitle: 'Обзор появится здесь, когда в системе будут данные.',
        },

        partial: {
            title: 'Часть данных недоступна',
            subtitle: 'Показываем данные, которые уже удалось загрузить.',
        },

        sections: {
            kpi: {
                title: 'Текущее состояние',
                subtitle: 'Главные показатели.',
            },

            sites: {
                title: 'Состояние площадок',
                subtitle: 'Площадки, которым сейчас нужно внимание.',
                empty: 'Площадки пока не найдены.',
                help: {
                    buttonAriaLabel: 'Открыть справку по секции площадок',
                    closeLabel: 'Закрыть',
                    title: 'Как читать карточку площадки',
                    description:
                        'Карточка площадки показывает её текущее состояние, статус камер и количество инцидентов за выбранный период.',
                    items: {
                        periodTitle: 'Период',
                        periodDescription:
                            'Этот период общий для всех счётчиков инцидентов в секции. Если выбрано 30 дней, все значения по инцидентам считаются именно за эти 30 дней.',
                        nameTitle: 'Название площадки',
                        nameDescription:
                            'В заголовке показаны код и название площадки. Код помогает быстро найти площадку в списках, отчётах и схемах.',
                        contextTitle: 'Город и часовой пояс',
                        contextDescription:
                            'На карточке показываются город и часовой пояс площадки, чтобы было проще понимать локальное время событий и сигналов камер.',
                        modeTitle: 'Режим площадки',
                        modeDescription:
                            'Показывает, активна площадка, на обслуживании, неактивна или в архиве. Это рабочий статус площадки, а не качество мониторинга.',
                        healthTitle: 'Состояние площадки',
                        healthDescription:
                            'Показывает общее состояние мониторинга на площадке. Оно зависит от доступности камер и количества камер с проблемами.',
                        camerasOnlineTitle: 'Камер в сети',
                        camerasOnlineDescription:
                            'Показывает, сколько камер на площадке сейчас доступны и передают данные, из общего числа подключённых камер.',
                        camerasProblemTitle: 'Камер с проблемами',
                        camerasProblemDescription:
                            'Показывает, сколько камер требуют внимания: они недоступны, работают нестабильно или давно не передавали данные.',
                        incidentsTitle: 'Инциденты',
                        incidentsDescription:
                            'Показывает, сколько инцидентов было зафиксировано на этой площадке за выбранный период.',
                    },
                },
            },

            cameras: {
                actions: {
                    createSite: 'Создать площадку',
                },
                title: 'Камеры по площадкам',
                subtitle:
                    'Сводка по площадкам: камеры в сети, камеры с проблемами и раскрываемые списки камер.',
                empty: 'Камеры пока не найдены.',
                help: {
                    buttonAriaLabel: 'Открыть справку по секции камер',
                    closeLabel: 'Закрыть',
                    title: 'Как читать секцию камер',
                    description:
                        'Период в шапке секции общий для всех счётчиков инцидентов. У каждой площадки есть короткая сводка, а список камер можно раскрывать и скрывать отдельно.',
                    items: {
                        periodTitle: 'Период',
                        periodDescription:
                            'Один общий период для всех счётчиков инцидентов в этой секции — и по площадке, и по каждой камере.',
                        onlineTitle: 'В сети',
                        onlineDescription:
                            'Показывает, сколько камер на площадке сейчас доступны из общего количества камер этой площадки.',
                        attentionTitle: 'Требуют внимания',
                        attentionDescription:
                            'Показывает, сколько камер на площадке сейчас имеют проблемы со связью, статусом или диагностикой.',
                        siteIncidentsTitle: 'Инциденты по площадке',
                        siteIncidentsDescription:
                            'Показывает, сколько инцидентов было зафиксировано на всей площадке за выбранный период.',
                        cameraStateTitle: 'Состояние камеры',
                        cameraStateDescription:
                            'Главное состояние камеры: работает штатно, неактивна или требует внимания.',
                        reasonTitle: 'Причина',
                        reasonDescription:
                            'Коротко объясняет, почему камера попала в список и что нужно проверить.',
                        statusTitle: 'Статус камеры',
                        statusDescription:
                            'Текущий рабочий статус, который приходит из системы.',
                        diagnosticsTitle: 'Диагностика',
                        diagnosticsDescription:
                            'Краткая техническая сводка по состоянию камеры.',
                        signalTitle: 'Последний сигнал',
                        signalDescription:
                            'Показывает, когда от камеры в последний раз приходили данные.',
                    },
                },
            },

            incidents: {
                title: 'Инциденты',
                subtitle: 'График инцидентов за выбранный период.',
                chartEmpty: 'За выбранный период инцидентов не было.',
                chartAxisX: 'Даты',
                chartAxisY: 'Количество инцидентов',
                period: {
                    title: 'Период',
                    from: 'От',
                    to: 'До',
                    apply: 'Применить',
                    last7Days: '7 дней',
                    last30Days: '30 дней',
                },
            },
        },

        kpi: {
            sites: {
                title: 'Площадки',
                meta: 'В работе: {{operational}} · Требуют внимания: {{attention}}',
            },
            cameras: {
                title: 'Камеры',
                meta: 'В сети: {{online}} · Требуют внимания: {{attention}}',
            },
            incidents: {
                title: 'Инциденты',
                meta: 'За {{trendDays}} дн.: {{recent}} · Критичных: {{critical}}',
            },
        },

        labels: {
            sectionPeriodDays: 'Период: {{days}} дн.',

            siteContext: 'Город: {{city}} · Часовой пояс: {{timezone}}',
            siteContextFallback: 'Контекст: {{value}}',
            siteHealthPill: 'Состояние: {{value}}',

            siteCamerasOnline: 'Камер в сети: {{online}} из {{total}}',
            siteAttentionCameras: 'Камер с проблемами: {{value}}',
            siteIncidentsCount: 'Инцидентов: {{value}}',

            siteCamerasOnlineDetailed: 'В сети: {{online}} из {{total}}',
            siteAttentionCamerasDetailed: 'Требуют внимания: {{value}}',
            cameraGroupIncidentsDetailed: 'Инциденты: {{value}}',
            cameraGroupDisplayedCameras: 'Показано камер: {{value}}',

            cameraGroupIncidentsCount: 'Инцидентов по площадке: {{value}}',
            cameraIncidentsCount: 'Инцидентов по камере: {{value}}',
            cameraLastSeen: 'Последний сигнал камеры: {{value}}',
            cameraLastSeenStale: 'Сигнал устарел: {{value}}',

            cameraGroupExpand: 'Показать камеры',
            cameraGroupCollapse: 'Скрыть камеры',

            cameraStateInactive: 'Неактивна',
            cameraStateStable: 'Работает штатно',
            cameraStateCheckRequired: 'Требует внимания',

            cameraReasonInactive:
                'Камера не участвует в активном мониторинге.',
            cameraReasonOffline: 'Нет связи с камерой.',
            cameraReasonCriticalHealth:
                'Диагностика показывает критическое состояние.',
            cameraReasonStale:
                'Камера давно не передавала данные.',
            cameraReasonWarningHealth:
                'Есть признаки нестабильной работы.',
            cameraReasonUnknownHealth:
                'Недостаточно данных. Камеру нужно проверить.',
            cameraReasonStable:
                'По связи и диагностике явных проблем не видно.',

            cameraStatusMetric: 'Статус камеры: {{value}}',
            cameraDiagnosticStatusMetric: 'Диагностика: {{value}}',
            cameraLastSignalMetric: 'Последний сигнал: {{value}}',
            cameraLastSignalMetricStale: 'Нет сигнала с: {{value}}',
            cameraIncidentsDetailed: 'Инциденты: {{value}}',

            incidentSeverity: 'Критичность: {{value}}',
            incidentType: 'Тип: {{value}}',

            incidentsSummary: 'Всего инцидентов: {{total}} · Критичных: {{critical}}',
            windowDays: 'Период: {{days}} дн. · График: {{trendDays}} дн.',

            mediaAvailable: 'Есть медиа',
            siteCameraPair: '{{site}} · {{camera}}',

            camerasOnline: 'В сети: {{online}} из {{total}}',
            camerasAttention: 'Требуют внимания: {{value}}',
            incidentsRecent: 'За период: {{value}}',
            lastSeen: 'Последний сигнал: {{value}}',
            lastSeenStale: 'Сигнал устарел: {{value}}',
        },
    },

    camera: {
        status: {
            online: 'В сети',
            offline: 'Не в сети',
            problematic: 'Требует внимания',
            degraded: 'Нестабильна',
            initializing: 'Инициализация',
            unknown: 'Неизвестно',
        },

        healthBadge: {
            healthy: 'Норма',
            warning: 'Предупреждение',
            critical: 'Критично',
            unknown: 'Неизвестно',
        },

        healthReason: {
            noSignal: 'Нет сигнала',
            noFrames: 'Кадры не поступают',
            streamUnavailable: 'Поток недоступен',
            highLatency: 'Высокая задержка потока',
            authFailed: 'Ошибка авторизации',
            detectorUnavailable: 'Модуль анализа недоступен',
            initializing: 'Инициализация',
            unknown: 'Причина неизвестна',
        },

        details: {
            title: 'Детали камеры',
            loading: 'Загружаем данные камеры…',

            empty: {
                title: 'Камера не найдена',
                subtitle: 'Запрошенная камера не существует или сейчас недоступна.',
            },

            error: {
                title: 'Не удалось загрузить камеру',
                subtitle: 'Попробуйте обновить страницу или повторить запрос.',
            },

            header: {
                primary: {
                    online: 'Камера работает штатно',
                    problematic: 'Камера требует внимания',
                    offline: 'Камера недоступна',
                    unknown: 'Состояние камеры неизвестно',
                },
                summary: {
                    streamUnavailable: 'Поток недоступен, камеру нужно проверить.',
                    highLatency: 'Камера в сети, но поток идёт с высокой задержкой.',
                    problemDetectedPrefix: 'Камера в сети, но требует внимания:',
                    unstable: 'Камера работает нестабильно.',
                    operational: 'Поток доступен, камера работает штатно.',
                },
            },

            actions: {
                back: 'Назад',
                refresh: 'Обновить',
                retry: 'Повторить',
                save: 'Сохранить',
                saving: 'Сохранение…',
                reset: 'Сбросить',
                showSettings: 'Настройки',
                hideSettings: 'Скрыть настройки',
                closeSettings: 'Закрыть настройки',
                delete: 'Удалить камеру',
                deleting: 'Удаление…',
                deleteConfirm: 'Удалить эту камеру?',
            },

            refresh: {
                pending: 'Обновление…',
                updated: 'Данные обновлены',
                unchanged: 'Изменений нет. Данные уже актуальны.',
                failed: 'Не удалось обновить данные',
            },

            save: {
                error: 'Не удалось сохранить изменения камеры.',
            },

            delete: {
                error: 'Не удалось удалить камеру.',
            },

            sections: {
                monitoring: {
                    title: 'Ключевые показатели',
                    subtitle:
                        'Главные показатели камеры без повторов.',
                },
                video: {
                    title: 'Видео',
                    subtitle: 'Живой поток, разметка ИИ и архивные сегменты.',
                },
                metadata: {
                    title: 'Метаданные',
                    subtitle:
                        'Идентификаторы камеры и основные временные метки.',
                },
                health: {
                    title: 'Состояние камеры',
                    subtitle:
                        'Сводка состояния, причина проблемы и ключевые метрики.',
                },
                realtime: {
                    title: 'Последние события',
                    subtitle:
                        'События камеры и важные обновления.',
                },
                settings: {
                    title: 'Быстрые настройки',
                    subtitle:
                        'Основные настройки камеры в одном месте.',
                },
            },

            summary: {
                primaryStatus: 'Главный статус',
                status: 'Статус в системе',
                activity: 'Активность',
                lastSeenAt: 'Последний сигнал',
            },

            meta: {
                id: 'ID камеры',
                site: 'Площадка',
                location: 'Расположение',
                model: 'Модель',
                serialNumber: 'Серийный номер',
                createdAt: 'Создана',
                updatedAt: 'Обновлена',
            },

            health: {
                overall: 'Состояние камеры',
                backendStatus: 'Статус в системе',
                reason: 'Причина',
                updatedAt: 'Обновлено',
                uptimeRatio: 'Время в сети',
                avgLatencyMs: 'Средняя задержка',
                recentIncidentCount: 'Недавние инциденты',

                level: {
                    ok: 'Норма',
                    warning: 'Предупреждение',
                    critical: 'Критично',
                    unknown: 'Неизвестно',
                },
            },

            form: {
                fields: {
                    siteId: 'Площадка',
                    name: 'Название камеры',
                    isActive: 'Участвует в мониторинге',
                },
                validation: {
                    siteIdRequired: 'Не задана площадка камеры.',
                    nameRequired: 'Введите название камеры.',
                },
            },

            video: {
                empty: 'Видео сейчас недоступно.',

                incidents: {
                    title: 'Связанные инциденты',
                    subtitle: 'Недавние инциденты по этой камере для быстрого перехода к деталям.',
                },

                archive: {
                    title: 'Архив',
                    subtitle: 'Недавние записи и сегменты по выбранной камере.',
                    empty: 'Архивные сегменты пока недоступны.',
                    incidentCount: '{{count}} событий',
                    eventsLabel: 'событий',
                },

                mode: {
                    raw: 'Оригинал',
                    annotated: 'Разметка ИИ',
                    original: 'Оригинал',
                    processed: 'Обработанный',
                    current: 'Текущий режим',
                },

                processed: {
                    status: 'Обработанный поток',
                    available: 'Доступен',
                    unavailable: 'Недоступен',
                },

                actions: {
                    refresh: 'Обновить',
                    openSegment: 'Открыть запись',
                },

                meta: {
                    startedAt: 'Начало',
                    expiresAt: 'Доступно до',
                    aiModelVersion: 'Модель ИИ',
                    latency: 'Задержка',
                },

                badges: {
                    aiOverlay: 'Разметка ИИ доступна',
                },

                stream: {
                    status: 'Статус потока',
                    available: 'Поток доступен',
                    unavailable: 'Поток недоступен',
                    unavailableHint:
                        'Проверьте доступность потока или попробуйте обновить данные камеры.',
                },

                overlay: {
                    status: 'Разметка ИИ',
                    available: 'Доступна',
                    unavailable: 'Недоступна',
                },
            },

            realtime: {
                empty: 'Событий по камере пока нет.',

                title: {
                    online: 'Камера снова работает штатно',
                    offline: 'Камера недоступна',
                    degraded: 'Камера работает нестабильно',
                    updated: 'Данные камеры обновлены',
                },

                message: {
                    online: 'Поток снова доступен, камера работает штатно.',
                    offline: 'Поток недоступен, сигнал потерян.',
                    degraded: 'Обнаружена проблема в работе камеры.',
                    updated: 'Параметры камеры обновлены.',
                },
            },
        },

        workspace: {
            title: 'Камеры',
            subtitle:
                'Фильтруйте камеры, смотрите их текущее состояние и открывайте карточки камер.',

            loading: 'Загружаем камеры…',

            empty: {
                title: 'Камеры не найдены',
                subtitle: 'Измените фильтры или попробуйте позже.',
            },

            error: {
                title: 'Не удалось загрузить камеры',
                subtitle:
                    'Попробуйте заново открыть страницу камер.',
            },

            sections: {
                filters: {
                    title: 'Фильтры',
                    subtitle:
                        'Сузьте список камер по площадке, статусу и состоянию.',
                },
                bulk: {
                    title: 'Массовые действия',
                    subtitle:
                        'Изменения для выбранных камер.',
                },
                health: {
                    title: 'Текущая сводка',
                    subtitle:
                        'Быстрые счётчики по текущей странице и результату фильтрации.',
                },
                realtime: {
                    title: 'Обновления в реальном времени',
                    subtitle:
                        'Последние изменения камер из живого потока.',
                },
                table: {
                    title: 'Список камер',
                    subtitle:
                        'Просматривайте найденные камеры и открывайте детали.',
                },
            },

            actions: {
                applyFilters: 'Применить фильтры',
                resetFilters: 'Сбросить фильтры',
                restoreFilters: 'Вернуть применённые',
            },

            filters: {
                presets: {
                    all: 'Все',
                    offline: 'Не в сети',
                    problematic: 'Требуют внимания',
                },

                lastAppliedAt: 'Последнее применение',

                fields: {
                    siteId: 'Площадка',
                    search: 'Поиск',
                    isActive: 'Активность',
                    statuses: 'Статусы',
                    healthStatuses: 'Состояния',
                },

                searchPlaceholder: 'Поиск по названию или ID камеры',

                siteSearch: {
                    placeholder: 'Найдите площадку по названию',
                    loading: 'Загружаем площадки…',
                    empty: 'Подходящие площадки не найдены.',
                    selected: 'Выбрана площадка: {{site}}',
                    clear: 'Очистить площадку',
                    optionsLabel: 'Варианты площадок',
                    optionsPlaceholder: 'Выберите площадку из списка',
                },

                activity: {
                    any: 'Любая',
                    active: 'Активные',
                    inactive: 'Неактивные',
                },
            },

            bulk: {
                selectedCount: 'Выбрано',
                empty:
                    'Выберите хотя бы одну камеру, чтобы применить изменения.',
                error: 'Не удалось применить массовые изменения.',
                applying: 'Применяем…',
                apply: 'Применить изменения',
                clearSelection: 'Снять выделение',
                hint: 'Выберите хотя бы одно поле для обновления.',

                fields: {
                    siteId: 'Новый ID площадки',
                    name: 'Новое название камеры',
                    isActive: 'Активность',
                },

                activity: {
                    noop: 'Не изменять',
                    active: 'Сделать активной',
                    inactive: 'Сделать неактивной',
                },
            },

            health: {
                matching: 'Подходят под фильтр',
                onPage: 'На странице',
                active: 'Активные',
                online: 'В сети',
                problematic: 'Требуют внимания',
                offline: 'Не в сети',
                stale: 'Сигнал устарел',
                selected: 'Выбрано',
            },

            realtime: {
                lastSync: 'Последняя синхронизация',
                empty: 'Недавних обновлений камер нет.',
            },

            table: {
                visibleColumns: 'Видимые колонки',
                total: 'Всего',
                pageSize: 'Размер страницы',
                empty: 'Камеры не найдены.',
                actions: 'Действия',
                open: 'Открыть',
                delete: 'Удалить',
                deleting: 'Удаление…',
                deleteConfirm: 'Удалить эту камеру?',
                deleteError: 'Не удалось удалить камеру.',
                page: 'Страница',
                previous: 'Назад',
                next: 'Вперёд',

                columns: {
                    name: 'Камера',
                    site: 'Площадка',
                    location: 'Расположение',
                    isActive: 'Активность',
                    status: 'Статус в системе',
                    healthStatus: 'Состояние',
                    lastSeenAt: 'Последний сигнал',
                },
            },
        },
    },

    site: {
        status: {
            active: 'Активна',
            inactive: 'Неактивна',
            maintenance: 'Обслуживание',
            archived: 'Архив',
        },

        create: {
            summary: {
                eyebrow: 'Новая площадка',
                title: 'Площадка создана',
                subtitle:
                    'Теперь можно сразу добавить камеры. Этот шаг необязателен.',
                fields: {
                    site: 'Площадка',
                    code: 'Код',
                    region: 'Регион',
                    address: 'Адрес',
                    cameras: 'Добавлено камер',
                },
                hintWithoutCameras:
                    'Можно завершить создание сейчас или пропустить шаг камер.',
                hintWithCameras:
                    'Камеры уже добавлены. Проверьте список и завершите настройку.',
            },

            actions: {
                finish: 'Завершить настройку',
                skipCameras: 'Пропустить шаг камер',
            },

            cameras: {
                eyebrow: 'Шаг 2',
                title: 'Камеры новой площадки',
                subtitle:
                    'Укажите основные данные и параметры подключения. Сначала система проверит доступ к камере, затем её можно будет сохранить.',
                total: 'Добавлено камер: {{count}}',
                totalLabel: 'Камер',

                composer: {
                    title: 'Добавление камеры',
                    subtitle:
                        'Заполните данные камеры и подключение к потоку, затем запустите проверку.',
                },

                list: {
                    title: 'Добавленные камеры',
                    subtitle:
                        'После сохранения камера появится в этом списке.',
                },

                siteRequired: 'Сначала сохраните площадку.',

                sections: {
                    identity: {
                        title: 'Основные данные',
                        description:
                            'Название камеры и место установки.',
                    },
                    connection: {
                        title: 'Подключение',
                        description:
                            'Параметры доступа к потоку камеры.',
                    },
                    overrides: {
                        title: 'Дополнительно',
                        description:
                            'Необязательные сведения о камере.',
                    },
                },

                fields: {
                    name: 'Название камеры',
                    location: 'Место установки',
                    host: 'IP-адрес или хост',
                    port: 'Порт',
                    username: 'Логин',
                    password: 'Пароль',
                    path: 'Адрес потока',
                    vendor: 'Производитель',
                    model: 'Модель',
                    serialNumber: 'Серийный номер',
                },

                placeholders: {
                    name: 'Например, Вход 1',
                    location: 'Например, зона погрузки',
                    host: 'Например, 192.168.1.120',
                    port: '554',
                    username: 'Например, admin',
                    password: 'Введите пароль',
                    path: '/Streaming/Channels/101',
                    vendor: 'Например, Hikvision',
                    model: 'Например, DS-2CD2143G2-I',
                    serialNumber: 'Например, SN-001',
                },

                actions: {
                    check: 'Проверить подключение',
                    checking: 'Проверка…',
                    recheck: 'Проверить снова',
                    create: 'Сохранить камеру',
                    creating: 'Сохранение…',
                    reset: 'Сбросить',
                    delete: 'Удалить',
                    deleting: 'Удаление…',

                    hint: {
                        recheck:
                            'Параметры подключения изменились. Перед сохранением нужно снова выполнить проверку.',
                        createReady:
                            'Подключение подтверждено. Камеру можно сохранить.',
                        checkRequired:
                            'Чтобы сохранить камеру, сначала выполните проверку подключения.',
                    },
                },

                create: {
                    error: 'Не удалось сохранить камеру.',
                    validation: {
                        siteIdRequired: 'Площадка не определена.',
                        nameRequired: 'Введите название камеры.',
                        locationRequired: 'Введите место установки.',
                        hostRequired: 'Введите IP-адрес или хост.',
                        portRequired: 'Введите порт.',
                        usernameRequired: 'Введите логин.',
                        passwordRequired: 'Введите пароль.',
                        pathRequired: 'Введите адрес потока.',
                        connectTimeoutRequired: 'Заполните обязательное поле.',
                        readTimeoutRequired: 'Заполните обязательное поле.',
                        generic: 'Заполните поле.',

                        portInvalid: 'Введите корректный номер порта.',
                        connectTimeoutInvalid: 'Введите корректное число.',
                        readTimeoutInvalid: 'Введите корректное число.',
                        numberInvalid: 'Введите корректное число.',

                        portRange: 'Порт должен быть в диапазоне от 1 до 65535.',
                        connectTimeoutRange: 'Значение выходит за допустимый диапазон.',
                        readTimeoutRange: 'Значение выходит за допустимый диапазон.',
                        rangeInvalid: 'Значение выходит за допустимый диапазон.',
                    },
                },

                check: {
                    error: 'Не удалось проверить подключение.',
                    status: 'Результат проверки: {{value}}',
                    sourcePreview: 'Подключение: {{value}}',
                    discoveredDevice: 'Определено устройство: {{value}}',
                    discoveredStream: 'Поток: {{value}}',
                    expiresAt: 'Проверка действует до {{value}}',

                    diagnostics: {
                        responseTime: 'Время ответа: {{value}} мс',
                    },

                    state: {
                        recheckTitle: 'Нужно повторно проверить подключение',
                        verifiedTitle: 'Подключение подтверждено',
                        initialTitle: 'Проверьте подключение',

                        recheckDescription:
                            'Параметры подключения были изменены. Перед сохранением нужно снова выполнить проверку.',
                        verifiedDescription:
                            'Проверка прошла успешно. Теперь камеру можно сохранить.',
                        readyDescription:
                            'Все обязательные поля заполнены. Можно запускать проверку.',
                        fillDescription:
                            'Заполните основные данные и параметры подключения, затем запустите проверку.',
                    },
                },

                loading: 'Загрузка камер…',
                loadError: 'Не удалось загрузить камеры площадки.',
                empty: 'Вы пока не добавили ни одной камеры.',
                deleteConfirm: 'Удалить эту камеру?',
                deleteError: 'Не удалось удалить камеру.',
            },
        },


        health: {
            normal: 'Норма',
            warning: 'Предупреждение',
            critical: 'Критично',
            unknown: 'Неизвестно',
        },

        workspace: {
            title: 'Площадки',
            subtitle:
                'Фильтры, список и карточки площадок.',
            loading: 'Загружаем список площадок…',

            empty: {
                title: 'Площадки не найдены',
                subtitle: 'Попробуйте изменить фильтры или создать новую площадку.',
            },

            error: {
                title: 'Не удалось загрузить площадки',
                subtitle: 'Попробуйте обновить список или повторить попытку позже.',
            },

            sections: {
                filters: {
                    title: 'Фильтры',
                    subtitle: 'Сужайте список площадок по основным признакам.',
                },
                bulk: {
                    title: 'Массовые действия',
                    subtitle: 'Изменения сразу для нескольких площадок.',
                },
                table: {
                    title: 'Список площадок',
                    subtitle: 'Просматривайте найденные площадки и открывайте нужную карточку.',
                },
            },

            actions: {
                create: 'Создать площадку',
            },

            filters: {
                fields: {
                    search: 'Поиск',
                    isActive: 'Активность',
                    regions: 'Регионы',
                },

                searchPlaceholder: 'Поиск по названию или коду площадки',

                activity: {
                    any: 'Любая',
                    active: 'Активна',
                    inactive: 'Неактивна',
                },

                regionEmpty: 'Регионы появятся после загрузки списка площадок.',

                actions: {
                    apply: 'Применить фильтры',
                    reset: 'Сбросить',
                },
            },

            bulk: {
                selectedCount: 'Выбрано площадок',
                error: 'Не удалось применить массовые изменения.',
                applying: 'Применяем…',
                apply: 'Применить изменения',
                clearSelection: 'Снять выделение',
                hint: 'Выберите площадки и задайте хотя бы одно изменение.',

                fields: {
                    region: 'Регион',
                    isActive: 'Активность',
                },

                activity: {
                    noop: 'Не менять',
                    active: 'Сделать активными',
                    inactive: 'Сделать неактивными',
                },
            },

            table: {
                visibleColumns: 'Видимые колонки',
                total: 'Всего',
                pageSize: 'Размер страницы',
                empty: 'Ничего не найдено по текущим фильтрам.',
                actions: 'Действия',
                open: 'Открыть',
                page: 'Страница',
                previous: 'Назад',
                next: 'Вперёд',

                columns: {
                    name: 'Площадка',
                    code: 'Код',
                    region: 'Регион',
                    isActive: 'Активность',
                },
            },
        },

        details: {
            title: 'Площадка',
            subtitle: 'Карточка площадки и основные данные.',
            loading: 'Загружаем данные площадки…',
            loadingRelated: 'Загрузка площадки и камер…',

            empty: {
                title: 'Площадка не найдена',
                subtitle: 'Проверьте выбранную площадку и попробуйте открыть её снова.',
            },

            error: {
                title: 'Не удалось загрузить площадку',
                subtitle: 'Попробуйте обновить страницу или открыть карточку позже.',
            },

            sections: {
                overview: {
                    title: 'Основные данные',
                    subtitle: 'Короткая сводка по площадке.',
                },
                meta: {
                    title: 'Дополнительно',
                    subtitle: 'Служебные, контактные и справочные сведения.',
                },
                summary: {
                    title: 'Сводка по камерам',
                    subtitle: 'Короткая сводка по состоянию камер на площадке.',
                },
                address: {
                    title: 'Адрес',
                    subtitle: 'Структурированные адресные данные площадки.',
                },
                contact: {
                    title: 'Контакт',
                    subtitle: 'Основные контактные данные площадки.',
                },
                cameras: {
                    title: 'Камеры площадки',
                    subtitle: 'Сначала показываются камеры, требующие внимания.',

                    empty: 'На площадке пока нет камер.',

                    state: {
                        offline: 'Офлайн',
                        problem: 'Требует внимания',
                        initializing: 'Инициализация',
                        unknown: 'Неизвестно',
                        stale: 'Нет свежего сигнала',
                        normal: 'Норма',
                    },

                    reason: {
                        noSignal: 'От камеры нет сигнала.',
                        noFrames: 'Кадры от камеры не поступают.',
                        streamUnavailable: 'Видеопоток недоступен.',
                        authFailed: 'Не удалось авторизоваться на камере.',
                        highLatency: 'У видеопотока высокая задержка.',
                        detectorUnavailable: 'Модуль аналитики недоступен.',
                        initializing: 'Камера ещё инициализируется.',
                        unknown: 'Причина текущего состояния неизвестна.',
                        offline: 'Камера недоступна.',
                        problem: 'Камеру нужно проверить по её текущему состоянию.',
                        stale: 'Последний сигнал от камеры был давно.',
                        normal: 'Камера работает штатно.',
                    },

                    diagnostics: {
                        normal: 'Норма',
                    },

                    labels: {
                        status: 'Статус: {{value}}',
                        lastSeen: 'Последний сигнал: {{value}}',
                        diagnostics: 'Диагностика: {{value}}',
                        incidents: 'Инциденты: {{value}}',
                    },
                },
            },

            fields: {
                name: 'Название',
                code: 'Код',
                region: 'Регион',
                isActive: 'Активность',
                address: 'Адрес',
                contact: 'Контакт',
                tags: 'Теги',
                createdAt: 'Создана',
                updatedAt: 'Обновлена',
                country: 'Страна',
                city: 'Город',
                addressLine1: 'Адрес',
                postalCode: 'Индекс',
                contactName: 'Имя',
                contactEmail: 'Email',
                contactPhone: 'Телефон',
                contactPosition: 'Должность',
            },

            summary: {
                total: 'Всего камер',
                online: 'В сети',
                problematic: 'Проблемных',
                offline: 'Офлайн',
                incidents: 'Инцидентов',
            },

            actions: {
                edit: 'Редактировать',
                close: 'Закрыть',
                back: 'Назад',
                delete: 'Удалить площадку',
                deleting: 'Удаление…',
                deleteConfirm: 'Удалить площадку?',
            },

            delete: {
                blocked: 'Нельзя удалить площадку, пока к ней привязаны камеры.',
                failed: 'Не удалось удалить площадку.',
            },

            cameras: {
                empty: 'На площадке пока нет камер.',
            },
        },

        edit: {
            title: 'Редактирование площадки',
            subtitle: 'Обновляйте основные данные площадки в одной форме.',
            loading: 'Загружаем данные площадки…',

            empty: {
                title: 'Площадка не найдена',
                subtitle: 'Сначала выберите площадку.',
            },

            error: {
                title: 'Не удалось открыть форму',
                subtitle: 'Попробуйте открыть площадку снова или вернуться позже.',
                submit: 'Не удалось сохранить изменения площадки.',
            },

            section: {
                title: 'Данные площадки',
                subtitle: 'Изменяйте только те поля, которые действительно нужны для карточки площадки.',
            },

            fields: {
                name: 'Название',
                code: 'Код',
                region: 'Регион',
                isActive: 'Активна',
            },

            validation: {
                required: 'Поле обязательно для заполнения.',
            },

            actions: {
                save: 'Сохранить',
                saving: 'Сохраняем…',
                reset: 'Сбросить',
                cancel: 'Отмена',
            },

            hints: {
                pristine: 'Измените одно или несколько полей, чтобы сохранить площадку.',
            },

            cameras: {
                eyebrow: 'Камеры',
                title: 'Камеры площадки',
                subtitle:
                    'Укажите основные данные и параметры подключения. Сначала система проверит доступ к камере, затем её можно будет сохранить.',
                total: 'Всего камер: {{count}}',
                totalLabel: 'Камер',

                composer: {
                    title: 'Добавление камеры',
                    subtitle:
                        'Заполните данные камеры и подключение к потоку, затем запустите проверку.',
                },

                list: {
                    title: 'Текущий список камер',
                    subtitle:
                        'После сохранения новая камера появится в этом списке.',
                },

                siteRequired:
                    'Сначала должна существовать сохранённая площадка.',

                sections: {
                    identity: {
                        title: 'Основные данные',
                        description:
                            'Название камеры и место установки.',
                    },
                    connection: {
                        title: 'Подключение',
                        description:
                            'Параметры доступа к потоку камеры.',
                    },
                    overrides: {
                        title: 'Дополнительно',
                        description:
                            'Необязательные сведения о камере.',
                    },
                },

                fields: {
                    name: 'Название камеры',
                    location: 'Место установки',
                    host: 'IP-адрес или хост',
                    port: 'Порт',
                    username: 'Логин',
                    password: 'Пароль',
                    path: 'Адрес потока',
                    vendor: 'Производитель',
                    model: 'Модель',
                    serialNumber: 'Серийный номер',
                },

                placeholders: {
                    name: 'Например, Вход 1',
                    location: 'Например, зона погрузки',
                    host: 'Например, 192.168.1.120',
                    port: '554',
                    username: 'Например, admin',
                    password: 'Введите пароль',
                    path: '/Streaming/Channels/101',
                    vendor: 'Например, Hikvision',
                    model: 'Например, DS-2CD2143G2-I',
                    serialNumber: 'Например, SN-001',
                },

                actions: {
                    check: 'Проверить подключение',
                    checking: 'Проверка…',
                    recheck: 'Проверить снова',
                    create: 'Сохранить камеру',
                    creating: 'Сохранение…',
                    reset: 'Сбросить',
                    delete: 'Удалить',
                    deleting: 'Удаление…',

                    hint: {
                        recheck:
                            'Параметры подключения изменились. Перед сохранением нужно снова выполнить проверку.',
                        createReady:
                            'Подключение подтверждено. Камеру можно сохранить.',
                        checkRequired:
                            'Чтобы сохранить камеру, сначала выполните проверку подключения.',
                    },
                },

                create: {
                    error: 'Не удалось сохранить камеру.',
                    validation: {
                        siteIdRequired: 'Площадка не определена.',
                        nameRequired: 'Введите название камеры.',
                        locationRequired: 'Введите место установки.',
                        hostRequired: 'Введите IP-адрес или хост.',
                        portRequired: 'Введите порт.',
                        usernameRequired: 'Введите логин.',
                        passwordRequired: 'Введите пароль.',
                        pathRequired: 'Введите адрес потока.',
                        connectTimeoutRequired: 'Заполните обязательное поле.',
                        readTimeoutRequired: 'Заполните обязательное поле.',
                        generic: 'Заполните поле.',

                        portInvalid: 'Введите корректный номер порта.',
                        connectTimeoutInvalid: 'Введите корректное число.',
                        readTimeoutInvalid: 'Введите корректное число.',
                        numberInvalid: 'Введите корректное число.',

                        portRange: 'Порт должен быть в диапазоне от 1 до 65535.',
                        connectTimeoutRange: 'Значение выходит за допустимый диапазон.',
                        readTimeoutRange: 'Значение выходит за допустимый диапазон.',
                        rangeInvalid: 'Значение выходит за допустимый диапазон.',
                    },
                },

                check: {
                    error: 'Не удалось проверить подключение.',
                    status: 'Результат проверки: {{value}}',
                    sourcePreview: 'Подключение: {{value}}',
                    discoveredDevice: 'Определено устройство: {{value}}',
                    discoveredStream: 'Поток: {{value}}',
                    expiresAt: 'Проверка действует до {{value}}',

                    diagnostics: {
                        responseTime: 'Время ответа: {{value}} мс',
                    },

                    state: {
                        recheckTitle: 'Нужно повторно проверить подключение',
                        verifiedTitle: 'Подключение подтверждено',
                        initialTitle: 'Проверьте подключение',

                        recheckDescription:
                            'Параметры подключения были изменены. Перед сохранением нужно снова выполнить проверку.',
                        verifiedDescription:
                            'Проверка прошла успешно. Теперь камеру можно сохранить.',
                        readyDescription:
                            'Все обязательные поля заполнены. Можно запускать проверку.',
                        fillDescription:
                            'Заполните основные данные и параметры подключения, затем запустите проверку.',
                    },
                },

                loading: 'Загрузка камер…',
                loadError: 'Не удалось загрузить камеры площадки.',
                empty: 'У этой площадки пока нет камер.',
                deleteConfirm: 'Удалить эту камеру?',
                deleteError: 'Не удалось удалить камеру.',
            },
        },

        form: {
            title: {
                create: 'Создание площадки',
                edit: 'Редактирование площадки',
            },

            hero: {
                createEyebrow: 'Новая площадка',
                editEyebrow: 'Редактирование',
            },

            sectionEyebrow: {
                address: 'Адрес',
                contact: 'Контакт',
            },

            subtitle: 'Адрес выбирается только из официального реестра.',
            subtitleCompact: 'Основные данные площадки: название, код, адрес и контакт.',
            loading: 'Загрузка площадки…',

            loadError: {
                title: 'Не удалось загрузить площадку',
                subtitle: 'Попробуйте снова открыть форму позже.',
            },

            sections: {
                general: {
                    title: 'Основные данные',
                    subtitle: 'Заполните базовые данные площадки.',
                },
                address: {
                    title: 'Адрес',
                    subtitle: 'Адрес выбирается только из официального реестра.',
                },
                contact: {
                    title: 'Контакт',
                    subtitle: 'Укажите хотя бы один способ связи: телефон или email.',
                },
            },

            fields: {
                name: 'Название площадки',
                code: 'Код',
                isActive: 'Статус площадки',
                addressQuery: 'Поиск адреса в реестре',
                contactName: 'Имя',
                contactPosition: 'Должность',
                contactEmail: 'Email',
                contactPhone: 'Телефон',
            },

            placeholders: {
                name: 'Например, Омск — Основное производство',
                code: 'Например, OMSK-01',
                addressQuery: 'Начните вводить адрес: город, улица, дом',
                contactName: 'ФИО или короткое имя',
                contactPosition: 'Выберите из списка или введите вручную',
                contactEmail: 'name@company.com',
                contactPhone: '+7 (___) ___-__-__',
            },

            status: {
                active: 'Активна',
                inactive: 'Неактивна',
            },

            contactPositionOptions: {
                siteManager: 'Руководитель площадки',
                siteAdministrator: 'Администратор площадки',
                shiftSupervisor: 'Начальник смены',
                operator: 'Оператор',
                engineer: 'Инженер',
                technician: 'Техник',
                securityOfficer: 'Сотрудник безопасности',
            },

            searchSelect: {
                toggleOptions: 'Показать варианты для поля «{{label}}»',
                empty: 'Подсказок нет. Можно ввести значение вручную.',
            },

            address: {
                hint: 'Выберите точный адрес из реестра.',
                lookupLoading: 'Поиск адресов…',
                lookupError: 'Не удалось загрузить адреса из реестра.',
                empty: 'Ничего не найдено. Уточните запрос и выберите адрес из реестра.',
                selectedTitle: 'Выбранный адрес',
                clear: 'Очистить',
                registryWarningTitle: 'Адрес ещё не привязан к реестру',
                registryWarningCurrent: 'Текущий адрес: {{value}}',
                registryWarningBody: 'Для изменения адреса выберите официальный адрес здания из реестра.',
                region: 'Регион',
                cityOrSettlement: 'Город / населённый пункт',
                street: 'Улица',
                house: 'Дом',
                building: 'Корпус / строение',
                postalCode: 'Индекс',
                okato: 'OKATO',
                oktmo: 'OKTMO',
            },

            actions: {
                create: 'Создать площадку',
                save: 'Сохранить изменения',
                saving: 'Сохранение…',
                reset: 'Сбросить',
                cancel: 'Отмена',
            },

            code: {
                help: 'Код можно отредактировать вручную или заново сгенерировать из названия.',
                compactHelp: 'Короткий код площадки. Пример: OMSK-FAS-02.',
                regenerate: 'Сгенерировать код',
            },

            errors: {
                save: 'Не удалось сохранить изменения площадки.',
            },

            validation: {
                required: 'Поле обязательно для заполнения.',
                nameRequired: 'Введите название площадки.',
                nameInvalid: 'Введите корректное название площадки.',
                codeRequired: 'Введите код площадки.',
                codeInvalid: 'Введите корректный код площадки.',
                registryRequired: 'Выберите адрес из официального реестра.',
                contactNameRequired: 'Введите имя контактного лица.',
                contactNameInvalid: 'Введите корректное имя контактного лица.',
                emailInvalid: 'Введите корректный email.',
                phoneInvalid: 'Введите корректный телефон.',
                contactMethodRequired: 'Укажите хотя бы один способ связи: телефон или email.',
            },
        },
    },

    incident: {
        severity: {
            info: 'Инфо',
            low: 'Низкая',
            medium: 'Средняя',
            high: 'Высокая',
            critical: 'Критичная',
        },
        type: {
            missing_headgear: 'Нет головного убора',
            wrong_headgear: 'Неверный головной убор',
            multiple_persons: 'Несколько человек',
            occluded_head: 'Голова перекрыта',
            uncertain: 'Неуверенное событие',
            other: 'Другое',
        },
        details: {
            title: 'Детали инцидента',
            loading: 'Загружаем детали инцидента…',
            empty: {
                title: 'Инцидент не найден',
                subtitle:
                    'Запрошенный инцидент не существует или сейчас недоступен.',
            },
            error: {
                title: 'Не удалось загрузить инцидент',
                subtitle: 'Попробуйте заново загрузить детали инцидента.',
            },
            actions: {
                back: 'Назад',
                refresh: 'Обновить',
                retry: 'Повторить',
                open: 'Открыть',
            },
            sections: {
                overview: {
                    title: 'Обзор',
                    subtitle: 'Основная сводка по инциденту.',
                },
                metadata: {
                    title: 'Метаданные',
                    subtitle: 'Основные идентификаторы и временные метки.',
                },
                media: {
                    title: 'Кадр и видеофрагмент',
                    subtitle: 'Сохранённый кадр с инцидентом и связанный видеофрагмент.',
                },
            },
            labels: {
                tags: 'Теги',
                correlationIds: 'Связанные ID',
            },
            summary: {
                severity: 'Критичность',
                type: 'Тип',
                confidence: 'Уверенность',
                dataQuality: 'Качество данных',
            },
            meta: {
                id: 'ID инцидента',
                eventId: 'ID события',
                site: 'Площадка',
                camera: 'Камера',
                eventTime: 'Время события',
                createdAt: 'Создан',
                updatedAt: 'Обновлён',
                confidence: 'Уверенность',
                dataQuality: 'Качество данных',
            },
            media: {
                empty: 'Медиа для этого инцидента недоступны.',
                image: 'Открыть кадр инцидента',
                video: 'Открыть видеофрагмент',
            },
        },
    },

    incidents: {
        workspace: {
            title: 'Инциденты',
            subtitle:
                'Ищите, фильтруйте, смотрите метрики и открывайте детали инцидента.',

            common: {
                retry: 'Повторить',
            },

            filters: {
                title: 'Фильтры',
                subtitle: 'Настройки поиска и фильтров инцидентов.',

                fields: {
                    search: {
                        label: 'Поиск',
                        help: 'Поиск по ID инцидента, ID события, площадке или камере.',
                        placeholder: 'Найти инциденты',
                    },
                    siteIds: {
                        label: 'ID площадок',
                        help: 'Список через запятую.',
                        placeholder: 'site-1, site-2',
                    },
                    cameraIds: {
                        label: 'ID камер',
                        help: 'Список через запятую.',
                        placeholder: 'camera-1, camera-2',
                    },
                    tags: {
                        label: 'Теги',
                        help: 'Список через запятую.',
                        placeholder: 'tag-1, tag-2',
                    },
                    from: {
                        label: 'От',
                        help: 'Начало диапазона времени события.',
                    },
                    to: {
                        label: 'До',
                        help: 'Конец диапазона времени события.',
                    },
                    minConfidence: {
                        label: 'Мин. уверенность',
                    },
                    maxConfidence: {
                        label: 'Макс. уверенность',
                    },
                    severities: {
                        label: 'Критичность',
                        empty: 'Нет доступных значений критичности.',
                    },
                    types: {
                        label: 'Типы',
                        empty: 'Нет доступных типов.',
                    },
                    pageSize: {
                        label: 'Размер страницы',
                        help: 'От {{min}} до {{max}}.',
                    },
                },

                actions: {
                    apply: 'Применить фильтры',
                    reset: 'Сбросить',
                },
            },

            metrics: {
                title: 'Метрики',
                subtitle: 'Сводные счётчики для текущих фильтров.',
                loading: 'Загружаем метрики…',
                error: 'Не удалось загрузить метрики инцидентов.',
                empty: 'Метрики недоступны.',

                cards: {
                    total: 'Всего',
                    critical: 'Критичные',
                    highSeverity: 'Высокая + критичная',
                },

                topSites: {
                    title: 'Топ площадок',
                    empty: 'Нет данных по площадкам.',
                },

                topCameras: {
                    title: 'Топ камер',
                    empty: 'Нет данных по камерам.',
                },
            },

            table: {
                title: 'Список инцидентов',
                subtitle: 'Откройте строку, чтобы посмотреть детали инцидента.',
                loading: 'Загружаем инциденты…',
                error: 'Не удалось загрузить инциденты.',
                empty: 'Инциденты не найдены.',

                columns: {
                    eventTime: 'Время события',
                    site: 'Площадка',
                    camera: 'Камера',
                    severity: 'Критичность',
                    type: 'Тип',
                    confidence: 'Уверенность',
                },

                pagination: {
                    summary: 'Всего: {{total}} · Страница {{currentPage}} из {{pageCount}}',
                    previous: 'Назад',
                    next: 'Вперёд',
                },
            },
        },
    },

    errors: {
        network: 'Не удалось подключиться к серверу',
        actionFailed: 'Не удалось выполнить действие',

        boundaryTitle: 'Произошла ошибка',
        boundarySubtitle: 'В приложении произошла непредвиденная ошибка.',
        boundaryDetails: 'Детали',
        boundaryReload: 'Перезагрузить',

        notFoundTitle: 'Страница не найдена',
        notFoundSubtitle: 'Ссылка может быть неверной или страница была удалена.',
        notFoundCode: 'Код: 404',
        back: 'Назад',
        goHome: 'На главную',

        httpTitle: 'Ошибка запроса',
        httpDetails: 'Детали ошибки',
        show: 'Показать',
        hide: 'Скрыть',
        retry: 'Повторить',
        reset: 'Сбросить',

        titleNetwork: 'Нет соединения',
        titleTimeout: 'Сервер отвечает слишком долго',
        titleTooManyRequests: 'Слишком много запросов',
        titleUnauthorized: 'Требуется авторизация',
        titleForbidden: 'Доступ запрещён',
        titleNotFound: 'Не найдено',
        titleBadRequest: 'Некорректный запрос',
        titleValidation: 'Некорректные данные',
        titleConflict: 'Конфликт данных',
        titleServerError: 'Ошибка сервера',

        hintCheckInternet: 'Проверьте интернет и попробуйте снова.',
        hintTryAgain: 'Попробуйте ещё раз.',
        hintTryLater: 'Попробуйте позже.',
        hintEnterSystem: 'Войдите в систему и повторите действие.',
        hintNoRights: 'У вас нет прав на это действие.',
        hintResourceNotFound: 'Ресурс не найден.',
        hintCheckFields: 'Проверьте введённые значения.',
        hintDataChanged: 'Данные изменились. Обновите страницу и повторите.',
        hintTooManyRequests: 'Попробуйте снова немного позже.',
        hintRetryAfter: 'Попробуйте снова позже (Retry-After: {{retryAfter}}).',

        tech: {
            code: 'код',
            status: 'статус',
            method: 'метод',
            url: 'url',
            correlation: 'correlation',
            retryAfter: 'retry-after',
            message: 'сообщение',
        },
    },

    settings: {
        title: 'Настройки',
        subtitle:
            'Язык и режим интерфейса. Здесь показываются только поддерживаемые настройки.',

        general: {
            title: 'Общие',
            subtitle:
                'Основные настройки интерфейса, которые уже доступны в приложении.',
        },

        fields: {
            languageLabel: 'Язык',
            languageHelp: 'Меняет язык приложения и сохраняется локально.',
            themeModeLabel: 'Режим интерфейса',
            themeModeHelp:
                'Определяет, использовать ли светлый, тёмный режим или режим системы.',
        },

        actions: {
            reset: 'Сбросить настройки интерфейса',
        },

        locale: {
            ru: 'Русский',
            en: 'English',
        },

        themeMode: {
            light: 'Светлый',
            dark: 'Тёмный',
            system: 'Как в системе',
        },
    },
};