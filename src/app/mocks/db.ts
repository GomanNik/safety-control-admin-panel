// =====================
// File: src/app/mocks/db.ts
// Purpose:
// - Mock in-memory database for sites, cameras, and incidents
// - Camera layer models real creation flow:
//   - connection check
//   - create only by successful short-lived verification token
//   - camera source is stored separately from camera card
//   - runtime state is stored separately from camera card
//   - list / single camera
//   - create / delete camera
//   - live video stream
//   - realtime camera / stream events
// - Site mock is cleaned from legacy runtime-only site fields
//   and stays aligned with current public Site DTO contracts
// - Site delete now performs cascade cleanup of linked mock data
//   to stay consistent with current frontend site-delete contract
// =====================

import type {
    SiteCreateDto,
    SiteDto,
    SiteListResponseDto,
    SiteMetricsDto,
    SitePatchDto,
} from '../../entities/site';

import type {
    CameraCreateDto,
    CameraDto,
    CameraListResponseDto,
    CameraVideoStreamDto,
} from '../../entities/camera';
import {
    CameraStatus,
    CameraStatusReasonCode,
    CAMERA_REALTIME_CHANNEL,
    CAMERA_VIDEO_REALTIME_CHANNEL,
} from '../../entities/camera';

import { emitMockRealtimeEvent } from '../../shared/realtime/mock-bridge';

import type {
    IncidentDto,
    IncidentListResponseDto,
    IncidentMetricsDto,
} from '../../entities/incident';
import {
    IncidentDataQualityStatus,
    IncidentSeverity,
    IncidentType,
} from '../../entities/incident';

// -----------------------------------------------------------------------------
// primitive runtime types
// -----------------------------------------------------------------------------

type PrimitiveQuery = string | string[] | number | boolean | undefined | null;
type QueryLike = Record<string, PrimitiveQuery>;

type CameraMockRealtimeEventType =
    | 'updated'
    | 'status_changed';

type DeleteSiteResult =
    | { ok: true }
    | { ok: false; reason: 'not_found' };

type LegacyCameraPatchDto = Partial<CameraDto> & {
    siteId?: string;
};

type LegacyCameraBulkUpdateDto = {
    camera_ids?: string[];
    patch?: LegacyCameraPatchDto;
};

// -----------------------------------------------------------------------------
// camera mock domain
// -----------------------------------------------------------------------------

type MockCameraTransport = 'rtsp';

type MockCameraConnectionCheckStatus =
    | 'ok'
    | 'auth_failed'
    | 'network_unreachable'
    | 'dns_failed'
    | 'timeout'
    | 'rtsp_invalid'
    | 'stream_not_found'
    | 'unsupported_transport'
    | 'unknown_error';

type MockCameraProvisioningState =
    | 'pending_verification'
    | 'verified'
    | 'binding'
    | 'ready'
    | 'error'
    | 'disabled';

type MockCameraConnectivityState =
    | 'reachable'
    | 'unreachable'
    | 'auth_failed'
    | 'timeout'
    | 'misconfigured'
    | 'unknown';

type MockCameraStreamState =
    | 'streaming'
    | 'no_stream'
    | 'starting'
    | 'stopped'
    | 'error';

interface MockCameraConnectionSource {
    transport: MockCameraTransport;
    host: string;
    port: number;
    username: string;
    password: string;
    path: string;
    query?: Record<string, string>;
    connect_timeout_ms: number;
    read_timeout_ms: number;
    use_tls: boolean;
}

interface MockCameraConnectionCheckRecord {
    token: string;
    site_id: string;
    name: string;
    location: string;
    source: MockCameraConnectionSource;

    status: MockCameraConnectionCheckStatus;
    ok: boolean;

    diagnostics?: {
        host_resolved?: boolean;
        tcp_connected?: boolean;
        auth_passed?: boolean;
        describe_passed?: boolean;
        response_time_ms?: number;
    };

    discovered_device?: {
        vendor?: string;
        model?: string;
        serial_number?: string;
        firmware_version?: string;
    };

    discovered_stream?: {
        codec?: string;
        width?: number;
        height?: number;
        fps?: number;
        has_video: boolean;
    };

    error?: {
        code: MockCameraConnectionCheckStatus;
        message: string;
    };

    used: boolean;
    used_at?: string;
    camera_id?: string;

    created_at: string;
    expires_at: string;
}

interface MockCameraSourceRecord {
    camera_id: string;
    transport: MockCameraTransport;
    host: string;
    port: number;
    path: string;
    username: string;
    password_secret_ref: string;
    credentials_set: boolean;
    use_tls: boolean;
    connect_timeout_ms: number;
    read_timeout_ms: number;
    source_fingerprint: string;
    created_at: string;
    updated_at: string;
}

interface MockCameraRuntimeStateRecord {
    camera_id: string;
    provisioning_state: MockCameraProvisioningState;
    connectivity_state: MockCameraConnectivityState;
    stream_state: MockCameraStreamState;
    last_check_at?: string;
    last_success_at?: string;
    last_error_at?: string;
    last_error_code?: string;
    last_error_message?: string;
    response_time_ms?: number;
}

type MockDbState = {
    sites: SiteDto[];
    cameras: CameraDto[];
    incidents: IncidentDto[];

    cameraSources: MockCameraSourceRecord[];
    cameraRuntimeStates: MockCameraRuntimeStateRecord[];
    cameraConnectionChecks: MockCameraConnectionCheckRecord[];
};

export type CreateCameraConnectionCheckResult = {
    ok: boolean;
    status: MockCameraConnectionCheckStatus;
    check_token?: string;
    diagnostics?: MockCameraConnectionCheckRecord['diagnostics'];
    discovered_device?: MockCameraConnectionCheckRecord['discovered_device'];
    discovered_stream?: MockCameraConnectionCheckRecord['discovered_stream'];
    error?: MockCameraConnectionCheckRecord['error'];
};

export type CreateCameraResult =
    | { ok: true; camera: CameraDto }
    | {
    ok: false;
    reason:
        | 'site_not_found'
        | 'invalid_connection_check_token'
        | 'expired_connection_check_token'
        | 'connection_check_not_passed'
        | 'duplicate_source';
    siteId?: string;
};

// -----------------------------------------------------------------------------
// constants
// -----------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;
const CAMERA_CONNECTION_CHECK_TTL_MS = 10 * 60 * 1000;

const MOCK_DB_STORAGE_KEY = 'mock_db_state_v9';

const CAMERA_STATUSES: readonly CameraStatus[] = [
    CameraStatus.Online,
    CameraStatus.Offline,
    CameraStatus.Problem,
    CameraStatus.Initializing,
] as const;

const INCIDENT_SEVERITIES: readonly IncidentSeverity[] = [
    IncidentSeverity.Info,
    IncidentSeverity.Low,
    IncidentSeverity.Medium,
    IncidentSeverity.High,
    IncidentSeverity.Critical,
] as const;

const INCIDENT_TYPES: readonly IncidentType[] = [
    IncidentType.MissingHeadgear,
    IncidentType.WrongHeadgear,
    IncidentType.MultiplePersons,
    IncidentType.OccludedHead,
    IncidentType.Uncertain,
    IncidentType.Other,
] as const;

const INCIDENT_DATA_QUALITY_STATUSES: readonly IncidentDataQualityStatus[] = [
    IncidentDataQualityStatus.Ok,
    IncidentDataQualityStatus.MissingFrame,
    IncidentDataQualityStatus.CorruptedMedia,
    IncidentDataQualityStatus.MissingContext,
] as const;

const CAMERA_NAME_PARTS = ['Вход', 'Линия', 'Фасовка', 'Склад', 'Коридор', 'Шлюз'] as const;
const CAMERA_LOCATION_PARTS = ['Проходная', 'Упаковка', 'Линия №1', 'Линия №2', 'Сырьевой склад', 'Зона отгрузки'] as const;
const CAMERA_MODEL_PARTS = ['Hikvision DS-2CD', 'Dahua IPC-HFW', 'Axis P1465', 'Uniview IPC232', 'TRASSIR TR-D2', 'HiWatch DS-I'] as const;
const CAMERA_VENDOR_PARTS = ['Hikvision', 'Dahua', 'Axis', 'Uniview', 'TRASSIR', 'HiWatch'] as const;
const CAMERA_CODEC_PARTS = ['H264', 'H265'] as const;
const INCIDENT_TAG_POOL = ['ppe', 'hairnet', 'helmet', 'night-shift', 'auto-detected'] as const;

const INCIDENT_SEVERITY_ORDER: Record<IncidentSeverity, number> = {
    [IncidentSeverity.Info]: 0,
    [IncidentSeverity.Low]: 1,
    [IncidentSeverity.Medium]: 2,
    [IncidentSeverity.High]: 3,
    [IncidentSeverity.Critical]: 4,
};

const SITE_SEEDS = [
    {
        id: 'site-omsk-01',
        code: 'OMSK-01',
        name: 'Омск — Основное производство',
        region: 'Omsk',
        timezone: 'Asia/Omsk',
        address: {
            country: 'Россия',
            region: 'Omsk',
            city: 'Омск',
            address_line1: 'Производственная, 1',
            postal_code: '644000',
        },
        contact: {
            name: 'Диспетчер смены',
            phone: '+7 (3812) 100-001',
        },
        tags: ['production', 'north', 'priority'],
    },
    {
        id: 'site-omsk-02',
        code: 'OMSK-02',
        name: 'Омск — Фасовка',
        region: 'Omsk',
        timezone: 'Asia/Omsk',
        address: {
            country: 'Россия',
            region: 'Omsk',
            city: 'Омск',
            address_line1: 'Линия 2',
            postal_code: '644001',
        },
        contact: {
            name: 'Старший смены',
            phone: '+7 (3812) 100-002',
        },
        tags: ['packing', 'south'],
    },
    {
        id: 'site-omsk-03',
        code: 'OMSK-03',
        name: 'Омск — Склад сырья',
        region: 'Omsk',
        timezone: 'Asia/Omsk',
        address: {
            country: 'Россия',
            region: 'Omsk',
            city: 'Омск',
            address_line1: 'Складская, 15',
            postal_code: '644002',
        },
        contact: {
            name: 'Кладовщик',
            phone: '+7 (3812) 100-003',
        },
        tags: ['warehouse', 'raw'],
    },
    {
        id: 'site-tyumen-01',
        code: 'TYUM-01',
        name: 'Тюмень — Производство',
        region: 'Tyumen',
        timezone: 'Asia/Yekaterinburg',
        address: {
            country: 'Россия',
            region: 'Tyumen',
            city: 'Тюмень',
            address_line1: 'Индустриальная, 12',
            postal_code: '625000',
        },
        contact: {
            name: 'Начальник площадки',
            phone: '+7 (3452) 200-001',
        },
        tags: ['production', 'regional'],
    },
    {
        id: 'site-nsk-01',
        code: 'NSK-01',
        name: 'Новосибирск — Лаборатория',
        region: 'Novosibirsk',
        timezone: 'Asia/Novosibirsk',
        address: {
            country: 'Россия',
            region: 'Novosibirsk',
            city: 'Новосибирск',
            address_line1: 'Научная, 9',
            postal_code: '630000',
        },
        contact: {
            name: 'Инженер QA',
            email: 'lab@example.local',
        },
        tags: ['lab', 'qa'],
    },
    {
        id: 'site-msk-01',
        code: 'MSK-01',
        name: 'Москва — Офис контроля',
        region: 'Moscow',
        timezone: 'Europe/Moscow',
        address: {
            country: 'Россия',
            region: 'Moscow',
            city: 'Москва',
            address_line1: 'Ленинский проспект, 101',
            postal_code: '119000',
        },
        contact: {
            name: 'Оператор контроля',
            email: 'control@example.local',
        },
        tags: ['office', 'hq'],
    },
    {
        id: 'site-ekb-01',
        code: 'EKB-01',
        name: 'Екатеринбург — Склад ГП',
        region: 'Ekaterinburg',
        timezone: 'Asia/Yekaterinburg',
        address: {
            country: 'Россия',
            region: 'Ekaterinburg',
            city: 'Екатеринбург',
            address_line1: 'Логистическая, 7',
            postal_code: '620000',
        },
        contact: {
            name: 'Логист',
            phone: '+7 (343) 300-001',
        },
        tags: ['warehouse', 'finished_goods'],
    },
    {
        id: 'site-kzn-01',
        code: 'KZN-01',
        name: 'Казань — Производство',
        region: 'Kazan',
        timezone: 'Europe/Moscow',
        address: {
            country: 'Россия',
            region: 'Kazan',
            city: 'Казань',
            address_line1: 'Заводская, 3',
            postal_code: '420000',
        },
        contact: {
            name: 'Администратор площадки',
            phone: '+7 (843) 400-001',
        },
        tags: ['production', 'east'],
    },
] as const;

// -----------------------------------------------------------------------------
// generic helpers
// -----------------------------------------------------------------------------

const pickFrom = <T,>(arr: readonly T[], index: number): T =>
    arr[index % arr.length];

const isoDaysAgo = (
    daysAgo: number,
    hour = 8,
    minute = 0,
    second = 0,
): string => {
    const date = new Date(Date.now() - daysAgo * DAY_MS);
    date.setHours(hour, minute, second, 0);
    return date.toISOString();
};

const deepClone = <T,>(value: T): T => {
    if (typeof structuredClone === 'function') {
        return structuredClone(value);
    }

    return JSON.parse(JSON.stringify(value)) as T;
};

const toRecord = (value: unknown): Record<string, unknown> =>
    value as Record<string, unknown>;

const toSiteDto = (value: Record<string, unknown>): SiteDto =>
    value as unknown as SiteDto;

const toCameraDto = (value: Record<string, unknown>): CameraDto =>
    value as unknown as CameraDto;

const toIncidentDto = (value: Record<string, unknown>): IncidentDto =>
    value as unknown as IncidentDto;

const canUseStorage = (): boolean => {
    try {
        return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
    } catch {
        return false;
    }
};

const asString = (value: PrimitiveQuery): string | undefined => {
    if (value === undefined || value === null) {
        return undefined;
    }

    if (Array.isArray(value)) {
        return value[0] != null
            ? String(value[0])
            : undefined;
    }

    return String(value);
};

const asNumber = (
    value: PrimitiveQuery,
    fallback: number,
): number => {
    const raw = asString(value);
    const parsed = raw ? Number(raw) : NaN;

    return Number.isFinite(parsed) && parsed > 0
        ? parsed
        : fallback;
};

const asArray = (value: PrimitiveQuery): string[] => {
    if (value === undefined || value === null) {
        return [];
    }

    if (Array.isArray(value)) {
        return value.map(String).filter(Boolean);
    }

    return [String(value)].filter(Boolean);
};

const normalizeSearch = (
    value: PrimitiveQuery,
): string => (asString(value) ?? '')
    .trim()
    .toLowerCase();

const includesAny = (
    source: string[] | undefined,
    wanted: string[],
): boolean => {
    if (!wanted.length) {
        return true;
    }

    const normalizedSource = new Set(
        (source ?? []).map((item) => String(item).toLowerCase()),
    );

    return wanted.some((item) =>
        normalizedSource.has(String(item).toLowerCase()),
    );
};

const includesValue = (
    value: unknown,
    wanted: string[],
): boolean => {
    if (!wanted.length) {
        return true;
    }

    const current = String(value ?? '').toLowerCase();

    return wanted
        .map((item) => item.toLowerCase())
        .includes(current);
};

const containsText = (
    haystack: Array<unknown>,
    search: string,
): boolean => {
    if (!search) {
        return true;
    }

    const joined = haystack
        .filter((item) => item !== undefined && item !== null)
        .map((item) => String(item).toLowerCase())
        .join(' ');

    return joined.includes(search);
};

const buildMeta = (
    page: number,
    pageSize: number,
    total: number,
) => {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return {
        page,
        pageSize,
        per_page: pageSize,
        total,
        total_count: total,
        totalPages,
        total_pages: totalPages,
        page_count: totalPages,
        hasNext: page < totalPages,
        has_next: page < totalPages,
        hasPrevious: page > 1,
        has_prev: page > 1,
    };
};

const paginate = <T,>(
    items: T[],
    query: QueryLike,
): { items: T[]; meta: ReturnType<typeof buildMeta> } => {
    const page = asNumber(query.page, 1);
    const pageSize = asNumber(query.pageSize, 25);
    const start = (page - 1) * pageSize;
    const end = start + pageSize;

    return {
        items: items.slice(start, end),
        meta: buildMeta(page, pageSize, items.length),
    };
};

const makeBucket = (
    kind: 'region' | 'type' | 'severity' | 'site' | 'camera',
    key: string,
    count: number,
) => ({
    key,
    code: key,
    label: key,
    value: count,
    count,
    [kind]: key,
});

const groupCount = <T,>(
    items: T[],
    getKey: (item: T) => string | undefined,
): Array<{ key: string; count: number }> => {
    const map = new Map<string, number>();

    for (const item of items) {
        const key = String(getKey(item) ?? 'unknown');
        map.set(key, (map.get(key) ?? 0) + 1);
    }

    return [...map.entries()]
        .map(([key, count]) => ({ key, count }))
        .sort((left, right) => right.count - left.count);
};

const normalizeSiteText = (value: unknown): string =>
    String(value ?? '').trim();

const normalizeSiteOptionalText = (
    value: unknown,
): string | undefined => {
    const normalized = normalizeSiteText(value);
    return normalized || undefined;
};

const normalizeSiteNullableText = (
    value: unknown,
): string | null | undefined => {
    if (value === undefined) {
        return undefined;
    }

    if (value === null) {
        return null;
    }

    const normalized = normalizeSiteText(value);
    return normalized || null;
};

const normalizeSiteStringArray = (
    value: unknown,
): string[] | undefined => {
    if (!Array.isArray(value)) {
        return undefined;
    }

    const unique = Array.from(
        new Set(
            value
                .map((item) => normalizeSiteText(item))
                .filter(Boolean),
        ),
    );

    return unique.length > 0
        ? unique
        : undefined;
};

const normalizeIsoString = (
    value: unknown,
    fallback: string,
): string => {
    const normalized = normalizeSiteOptionalText(value);

    if (!normalized) {
        return fallback;
    }

    const timestamp = Date.parse(normalized);

    return Number.isFinite(timestamp)
        ? new Date(timestamp).toISOString()
        : fallback;
};

const normalizeNullableIsoString = (
    value: unknown,
    fallback: string | null,
): string | null => {
    if (value === undefined) {
        return fallback;
    }

    if (value === null) {
        return null;
    }

    const normalized = normalizeSiteOptionalText(value);

    if (!normalized) {
        return fallback;
    }

    const timestamp = Date.parse(normalized);

    return Number.isFinite(timestamp)
        ? new Date(timestamp).toISOString()
        : fallback;
};

const normalizeSiteAddressValue = (
    value: unknown,
    regionFallback?: unknown,
): Record<string, unknown> | undefined => {
    if (value === undefined || value === null) {
        return undefined;
    }

    if (typeof value === 'string') {
        const line = normalizeSiteText(value);

        if (!line) {
            return undefined;
        }

        return {
            country: 'Россия',
            region: normalizeSiteOptionalText(regionFallback),
            address_line1: line,
        };
    }

    if (typeof value !== 'object') {
        return undefined;
    }

    const source = value as Record<string, unknown>;

    const country = normalizeSiteOptionalText(source.country) ?? 'Россия';
    const region =
        normalizeSiteOptionalText(source.region) ??
        normalizeSiteOptionalText(regionFallback);
    const city = normalizeSiteOptionalText(source.city);
    const addressLine1 = normalizeSiteOptionalText(
        source.address_line1 ?? source.addressLine1,
    );
    const addressLine2 = normalizeSiteOptionalText(
        source.address_line2 ?? source.addressLine2,
    );
    const postalCode = normalizeSiteOptionalText(
        source.postal_code ?? source.postalCode,
    );

    return {
        country,
        region,
        city,
        address_line1: addressLine1,
        address_line2: addressLine2,
        postal_code: postalCode,
        latitude: typeof source.latitude === 'number' ? source.latitude : undefined,
        longitude: typeof source.longitude === 'number' ? source.longitude : undefined,
    };
};

const normalizeSiteContactValue = (
    value: unknown,
): Record<string, unknown> | undefined => {
    if (value === undefined || value === null || typeof value !== 'object') {
        return undefined;
    }

    const source = value as Record<string, unknown>;

    const name = normalizeSiteOptionalText(source.name);
    const email = normalizeSiteOptionalText(source.email);
    const phone = normalizeSiteOptionalText(source.phone);
    const position = normalizeSiteOptionalText(source.position);

    if (!name && !email && !phone && !position) {
        return undefined;
    }

    return {
        name: name ?? 'Контакт',
        email,
        phone,
        position,
    };
};

const getNowIso = (): string =>
    new Date().toISOString();

const hasOwnKey = (
    value: Record<string, unknown>,
    key: string,
): boolean => Object.prototype.hasOwnProperty.call(value, key);

const createMockSiteId = (): string =>
    `site-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const createMockCameraId = (): string =>
    `camera-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const createMockConnectionCheckToken = (): string =>
    `camchk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

const createMockSecretRef = (): string =>
    `secret-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const hashText = (value: string): number => {
    let hash = 0;

    for (let i = 0; i < value.length; i += 1) {
        hash = ((hash << 5) - hash) + value.charCodeAt(i);
        hash |= 0;
    }

    return Math.abs(hash);
};

const clampPositiveInt = (
    value: unknown,
    fallback: number,
): number => {
    const parsed = Number(value);

    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }

    return Math.max(1, Math.trunc(parsed));
};

const findSiteNameInCollection = (
    sites: SiteDto[],
    siteId: string,
): string | undefined => {
    const site = sites.find((item) => String((item as any).id) === siteId);
    return site ? String((site as any).name ?? '') : undefined;
};

// -----------------------------------------------------------------------------
// camera normalization helpers
// -----------------------------------------------------------------------------

const toCameraReasonCode = (
    value: string | undefined,
): CameraStatusReasonCode | undefined =>
    value as CameraStatusReasonCode | undefined;

const normalizeCameraStatus = (
    value: unknown,
): CameraStatus => {
    switch (String(value ?? '').trim().toLowerCase()) {
        case CameraStatus.Online:
            return CameraStatus.Online;
        case CameraStatus.Offline:
            return CameraStatus.Offline;
        case CameraStatus.Problem:
        case 'degraded':
        case 'maintenance':
            return CameraStatus.Problem;
        case CameraStatus.Initializing:
            return CameraStatus.Initializing;
        default:
            return CameraStatus.Unknown;
    }
};

const normalizeCameraStatusReason = (
    value: unknown,
): CameraStatusReasonCode | undefined => {
    const normalized = String(value ?? '').trim().toLowerCase();

    switch (normalized) {
        case CameraStatusReasonCode.NoSignal:
            return CameraStatusReasonCode.NoSignal;
        case 'no_frames':
        case CameraStatusReasonCode.StreamUnavailable:
        case 'detector_unavailable':
            return CameraStatusReasonCode.StreamUnavailable;
        case CameraStatusReasonCode.AuthFailed:
            return CameraStatusReasonCode.AuthFailed;
        case CameraStatusReasonCode.HighLatency:
            return CameraStatusReasonCode.HighLatency;
        case CameraStatusReasonCode.Initializing:
            return CameraStatusReasonCode.Initializing;
        case CameraStatusReasonCode.Unknown:
            return CameraStatusReasonCode.Unknown;
        case 'network_unreachable':
        case 'dns_failed':
        case 'timeout':
        case 'configuration_invalid':
            return toCameraReasonCode(normalized);
        default:
            return undefined;
    }
};

const inferCameraStatusReason = (
    value: Record<string, unknown>,
): CameraStatusReasonCode | undefined => {
    const explicit = normalizeCameraStatusReason(
        value.status_reason ?? value.health_reason,
    );

    if (explicit) {
        return explicit;
    }

    const status = normalizeCameraStatus(value.status);

    switch (status) {
        case CameraStatus.Offline:
            return CameraStatusReasonCode.NoSignal;
        case CameraStatus.Problem:
            return CameraStatusReasonCode.HighLatency;
        case CameraStatus.Initializing:
            return CameraStatusReasonCode.Initializing;
        case CameraStatus.Unknown:
            return CameraStatusReasonCode.Unknown;
        case CameraStatus.Online:
        default:
            return undefined;
    }
};

const maskUsername = (
    value: string,
): string => {
    const normalized = String(value ?? '').trim();

    if (!normalized) {
        return '—';
    }

    if (normalized.length <= 2) {
        return `${normalized[0]}*`;
    }

    return `${normalized.slice(0, 2)}***`;
};

const normalizeRtspPath = (
    value: unknown,
): string => {
    const normalized = normalizeSiteOptionalText(value) ?? '';

    if (!normalized) {
        return '';
    }

    return normalized.startsWith('/')
        ? normalized
        : `/${normalized}`;
};

const normalizeStringMap = (
    value: unknown,
): Record<string, string> | undefined => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return undefined;
    }

    const out: Record<string, string> = {};

    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
        const normalizedKey = normalizeSiteOptionalText(key);
        const normalizedValue = normalizeSiteOptionalText(raw);

        if (!normalizedKey || !normalizedValue) {
            continue;
        }

        out[normalizedKey] = normalizedValue;
    }

    return Object.keys(out).length > 0
        ? out
        : undefined;
};

const normalizeConnectionSource = (
    value: unknown,
): MockCameraConnectionSource => {
    const source = (value && typeof value === 'object')
        ? value as Record<string, unknown>
        : {};

    return {
        transport: 'rtsp',
        host: normalizeSiteOptionalText(source.host) ?? '',
        port: clampPositiveInt(source.port, 554),
        username: normalizeSiteOptionalText(source.username) ?? '',
        password: normalizeSiteOptionalText(source.password) ?? '',
        path: normalizeRtspPath(source.path),
        query: normalizeStringMap(source.query),
        connect_timeout_ms: clampPositiveInt(source.connect_timeout_ms, 4000),
        read_timeout_ms: clampPositiveInt(source.read_timeout_ms, 4000),
        use_tls: Boolean(source.use_tls),
    };
};

const buildSourceFingerprint = (
    source: Pick<
        MockCameraConnectionSource,
        'transport' | 'host' | 'port' | 'path' | 'username' | 'use_tls' | 'query'
    >,
): string => {
    const query = source.query
        ? Object.entries(source.query)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, value]) => `${key}=${value}`)
            .join('&')
        : '';

    return [
        source.transport,
        source.host.trim().toLowerCase(),
        String(source.port),
        source.path.trim().toLowerCase(),
        source.username.trim().toLowerCase(),
        source.use_tls ? 'tls' : 'plain',
        query,
    ].join('|');
};

const inferVendorFromSource = (
    source: MockCameraConnectionSource,
): string => {
    const token = `${source.host}|${source.path}|${source.username}`;
    return pickFrom(CAMERA_VENDOR_PARTS, hashText(token));
};

const inferModelFromSource = (
    source: MockCameraConnectionSource,
): string => {
    const token = `${source.host}|${source.path}|${source.port}`;
    return pickFrom(CAMERA_MODEL_PARTS, hashText(token));
};

const inferSerialFromSource = (
    source: MockCameraConnectionSource,
): string => {
    const fingerprint = buildSourceFingerprint(source);
    return `SN-${hashText(fingerprint).toString().padStart(8, '0').slice(0, 8)}`;
};

const buildCameraSourceSummary = (
    source: MockCameraSourceRecord | undefined,
): Record<string, unknown> | undefined => {
    if (!source) {
        return undefined;
    }

    return {
        transport: source.transport,
        host: source.host,
        port: source.port,
        path: source.path,
        username_masked: maskUsername(source.username),
        credentials_set: source.credentials_set,
    };
};

const buildCameraDiagnostics = (
    runtime: MockCameraRuntimeStateRecord | undefined,
): Record<string, unknown> | undefined => {
    if (!runtime) {
        return undefined;
    }

    return {
        provisioning_state: runtime.provisioning_state,
        connectivity_state: runtime.connectivity_state,
        stream_state: runtime.stream_state,
        last_check_at: runtime.last_check_at,
        last_success_at: runtime.last_success_at,
        last_error_at: runtime.last_error_at,
        last_error_code: runtime.last_error_code,
        last_error_message: runtime.last_error_message,
        response_time_ms: runtime.response_time_ms,
    };
};

const mapRuntimeToStatus = (
    runtime: MockCameraRuntimeStateRecord | undefined,
    fallback: CameraStatus,
): CameraStatus => {
    if (!runtime) {
        return fallback;
    }

    if (
        runtime.provisioning_state === 'binding' ||
        runtime.stream_state === 'starting'
    ) {
        return CameraStatus.Initializing;
    }

    if (
        runtime.connectivity_state === 'auth_failed' ||
        runtime.connectivity_state === 'timeout' ||
        runtime.connectivity_state === 'misconfigured' ||
        runtime.stream_state === 'error'
    ) {
        return CameraStatus.Problem;
    }

    if (
        runtime.connectivity_state === 'unreachable' ||
        runtime.stream_state === 'no_stream' ||
        runtime.stream_state === 'stopped'
    ) {
        return CameraStatus.Offline;
    }

    if (
        runtime.provisioning_state === 'ready' &&
        runtime.connectivity_state === 'reachable' &&
        runtime.stream_state === 'streaming'
    ) {
        return CameraStatus.Online;
    }

    return fallback;
};

const mapRuntimeToReason = (
    runtime: MockCameraRuntimeStateRecord | undefined,
    fallback?: CameraStatusReasonCode,
): CameraStatusReasonCode | undefined => {
    if (!runtime) {
        return fallback;
    }

    switch (runtime.connectivity_state) {
        case 'auth_failed':
            return CameraStatusReasonCode.AuthFailed;
        case 'timeout':
            return toCameraReasonCode('timeout');
        case 'misconfigured':
            return toCameraReasonCode('configuration_invalid');
        case 'unreachable':
            return toCameraReasonCode('network_unreachable');
        default:
            break;
    }

    switch (runtime.stream_state) {
        case 'no_stream':
        case 'stopped':
            return CameraStatusReasonCode.NoSignal;
        case 'error':
            return CameraStatusReasonCode.StreamUnavailable;
        case 'starting':
            return CameraStatusReasonCode.Initializing;
        default:
            break;
    }

    if (runtime.provisioning_state === 'binding') {
        return CameraStatusReasonCode.Initializing;
    }

    return fallback;
};

const normalizeLoadedSiteDto = (
    value: Record<string, unknown>,
): SiteDto => {
    const nowIso = getNowIso();
    const region = normalizeSiteOptionalText(value.region);
    const name = normalizeSiteOptionalText(value.name) ?? 'Площадка';

    return toSiteDto({
        id: normalizeSiteOptionalText(value.id) ?? createMockSiteId(),
        name,
        code: normalizeSiteOptionalText(value.code),
        timezone: normalizeSiteOptionalText(value.timezone),
        region,
        address: normalizeSiteAddressValue(value.address, region),
        contact: normalizeSiteContactValue(value.contact),
        tags: normalizeSiteStringArray(value.tags),
        created_at: normalizeIsoString(value.created_at, nowIso),
        updated_at: normalizeIsoString(value.updated_at, nowIso),
        config:
            typeof value.config === 'object' && value.config !== null
                ? value.config
                : undefined,
        extra:
            typeof value.extra === 'object' && value.extra !== null
                ? value.extra
                : undefined,
    });
};

const normalizeLoadedCameraDto = (
    value: Record<string, unknown>,
    siteName?: string,
): CameraDto => {
    const nowIso = getNowIso();
    const siteId = normalizeSiteOptionalText(value.site_id ?? value.siteId) ?? 'site-unknown';
    const status = normalizeCameraStatus(value.status);
    const fallbackLastSeenAt =
        status === CameraStatus.Offline || status === CameraStatus.Unknown
            ? null
            : nowIso;

    return toCameraDto({
        ...value,
        id: normalizeSiteOptionalText(value.id) ?? createMockCameraId(),
        site_id: siteId,
        name: normalizeSiteOptionalText(value.name) ?? 'Камера',
        location: normalizeSiteOptionalText(value.location) ?? 'Не указано',
        vendor: normalizeSiteOptionalText(value.vendor),
        model: normalizeSiteOptionalText(value.model) ?? 'Не указана',
        serial_number: normalizeSiteOptionalText(
            value.serial_number ?? value.serialNumber,
        ) ?? 'N/A',
        status,
        status_reason: inferCameraStatusReason({
            ...value,
            status,
        }),
        last_seen_at: normalizeNullableIsoString(
            value.last_seen_at ?? value.lastSeenAt,
            fallbackLastSeenAt,
        ),
        created_at: normalizeIsoString(value.created_at, nowIso),
        updated_at: normalizeIsoString(value.updated_at, nowIso),
        site_name: normalizeSiteOptionalText(value.site_name) ?? siteName,
        source_summary:
            typeof value.source_summary === 'object' && value.source_summary !== null
                ? value.source_summary
                : undefined,
        diagnostics:
            typeof value.diagnostics === 'object' && value.diagnostics !== null
                ? value.diagnostics
                : undefined,
    });
};

const normalizeLoadedCameraSourceRecord = (
    value: Record<string, unknown>,
): MockCameraSourceRecord | null => {
    const camera_id = normalizeSiteOptionalText(value.camera_id ?? value.cameraId);

    if (!camera_id) {
        return null;
    }

    const transport: MockCameraTransport = 'rtsp';
    const host = normalizeSiteOptionalText(value.host) ?? '127.0.0.1';
    const port = clampPositiveInt(value.port, 554);
    const path = normalizeRtspPath(value.path) || '/Streaming/Channels/101';
    const username = normalizeSiteOptionalText(value.username) ?? 'operator';
    const use_tls = Boolean(value.use_tls);

    return {
        camera_id,
        transport,
        host,
        port,
        path,
        username,
        password_secret_ref:
            normalizeSiteOptionalText(value.password_secret_ref) ?? createMockSecretRef(),
        credentials_set:
            value.credentials_set === undefined
                ? true
                : Boolean(value.credentials_set),
        use_tls,
        connect_timeout_ms: clampPositiveInt(value.connect_timeout_ms, 4000),
        read_timeout_ms: clampPositiveInt(value.read_timeout_ms, 4000),
        source_fingerprint:
            normalizeSiteOptionalText(value.source_fingerprint) ??
            buildSourceFingerprint({
                transport,
                host,
                port,
                path,
                username,
                use_tls,
                query: undefined,
            }),
        created_at: normalizeIsoString(value.created_at, getNowIso()),
        updated_at: normalizeIsoString(value.updated_at, getNowIso()),
    };
};

const normalizeLoadedCameraRuntimeStateRecord = (
    value: Record<string, unknown>,
): MockCameraRuntimeStateRecord | null => {
    const camera_id = normalizeSiteOptionalText(value.camera_id ?? value.cameraId);

    if (!camera_id) {
        return null;
    }

    const provisioning_state = normalizeSiteOptionalText(
        value.provisioning_state,
    ) as MockCameraProvisioningState | undefined;

    const connectivity_state = normalizeSiteOptionalText(
        value.connectivity_state,
    ) as MockCameraConnectivityState | undefined;

    const stream_state = normalizeSiteOptionalText(
        value.stream_state,
    ) as MockCameraStreamState | undefined;

    return {
        camera_id,
        provisioning_state: provisioning_state ?? 'ready',
        connectivity_state: connectivity_state ?? 'reachable',
        stream_state: stream_state ?? 'streaming',
        last_check_at: normalizeSiteOptionalText(value.last_check_at),
        last_success_at: normalizeSiteOptionalText(value.last_success_at),
        last_error_at: normalizeSiteOptionalText(value.last_error_at),
        last_error_code: normalizeSiteOptionalText(value.last_error_code),
        last_error_message: normalizeSiteOptionalText(value.last_error_message),
        response_time_ms:
            typeof value.response_time_ms === 'number'
                ? value.response_time_ms
                : typeof value.responseTimeMs === 'number'
                    ? value.responseTimeMs
                    : undefined,
    };
};

const normalizeLoadedCameraConnectionCheckRecord = (
    value: Record<string, unknown>,
): MockCameraConnectionCheckRecord | null => {
    const token = normalizeSiteOptionalText(value.token);

    if (!token) {
        return null;
    }

    const source = normalizeConnectionSource(value.source);
    const status = normalizeSiteOptionalText(
        value.status,
    ) as MockCameraConnectionCheckStatus | undefined;

    return {
        token,
        site_id: normalizeSiteOptionalText(value.site_id) ?? '',
        name: normalizeSiteOptionalText(value.name) ?? '',
        location: normalizeSiteOptionalText(value.location) ?? '',
        source,
        status: status ?? 'unknown_error',
        ok: Boolean(value.ok),
        diagnostics:
            typeof value.diagnostics === 'object' && value.diagnostics !== null
                ? value.diagnostics as MockCameraConnectionCheckRecord['diagnostics']
                : undefined,
        discovered_device:
            typeof value.discovered_device === 'object' && value.discovered_device !== null
                ? value.discovered_device as MockCameraConnectionCheckRecord['discovered_device']
                : undefined,
        discovered_stream:
            typeof value.discovered_stream === 'object' && value.discovered_stream !== null
                ? value.discovered_stream as MockCameraConnectionCheckRecord['discovered_stream']
                : undefined,
        error:
            typeof value.error === 'object' && value.error !== null
                ? value.error as MockCameraConnectionCheckRecord['error']
                : undefined,
        used: Boolean(value.used),
        used_at: normalizeSiteOptionalText(value.used_at),
        camera_id: normalizeSiteOptionalText(value.camera_id),
        created_at: normalizeIsoString(value.created_at, getNowIso()),
        expires_at: normalizeIsoString(
            value.expires_at,
            new Date(Date.now() + CAMERA_CONNECTION_CHECK_TTL_MS).toISOString(),
        ),
    };
};

const isConnectionCheckExpired = (
    check: MockCameraConnectionCheckRecord,
): boolean =>
    Date.parse(check.expires_at) <= Date.now();

const evaluateConnectionCheck = (args: {
    siteId: string;
    name: string;
    location: string;
    source: MockCameraConnectionSource;
}): Omit<
    MockCameraConnectionCheckRecord,
    'token' | 'created_at' | 'expires_at' | 'used' | 'used_at' | 'camera_id'
> => {
    const {
        siteId,
        name,
        location,
        source,
    } = args;

    const hostToken = source.host.toLowerCase();
    const userToken = source.username.toLowerCase();
    const passToken = source.password.toLowerCase();
    const pathToken = source.path.toLowerCase();

    const responseTimeMs = 120 + (hashText(buildSourceFingerprint(source)) % 700);

    const base = {
        site_id: siteId,
        name,
        location,
        source,
    };

    if (source.transport !== 'rtsp') {
        return {
            ...base,
            ok: false,
            status: 'unsupported_transport',
            diagnostics: {
                host_resolved: false,
                tcp_connected: false,
                auth_passed: false,
                describe_passed: false,
                response_time_ms: responseTimeMs,
            },
            error: {
                code: 'unsupported_transport',
                message: 'Only RTSP transport is supported.',
            },
        };
    }

    if (!source.host || !source.username || !source.password || !source.path) {
        return {
            ...base,
            ok: false,
            status: 'rtsp_invalid',
            diagnostics: {
                host_resolved: false,
                tcp_connected: false,
                auth_passed: false,
                describe_passed: false,
                response_time_ms: responseTimeMs,
            },
            error: {
                code: 'rtsp_invalid',
                message: 'Host, username, password and RTSP path are required.',
            },
        };
    }

    if (hostToken.includes('dns') || hostToken.includes('resolve')) {
        return {
            ...base,
            ok: false,
            status: 'dns_failed',
            diagnostics: {
                host_resolved: false,
                tcp_connected: false,
                auth_passed: false,
                describe_passed: false,
                response_time_ms: responseTimeMs,
            },
            error: {
                code: 'dns_failed',
                message: 'Host name could not be resolved.',
            },
        };
    }

    if (hostToken.includes('timeout') || hostToken.includes('slow')) {
        return {
            ...base,
            ok: false,
            status: 'timeout',
            diagnostics: {
                host_resolved: true,
                tcp_connected: false,
                auth_passed: false,
                describe_passed: false,
                response_time_ms: Math.max(responseTimeMs, 3000),
            },
            error: {
                code: 'timeout',
                message: 'Connection attempt timed out.',
            },
        };
    }

    if (
        hostToken.includes('offline') ||
        hostToken.includes('down') ||
        hostToken.includes('unreach')
    ) {
        return {
            ...base,
            ok: false,
            status: 'network_unreachable',
            diagnostics: {
                host_resolved: true,
                tcp_connected: false,
                auth_passed: false,
                describe_passed: false,
                response_time_ms: responseTimeMs,
            },
            error: {
                code: 'network_unreachable',
                message: 'Camera host is not reachable over network.',
            },
        };
    }

    if (
        userToken.includes('bad') ||
        userToken.includes('wrong') ||
        passToken.includes('bad') ||
        passToken.includes('wrong') ||
        passToken.includes('fail')
    ) {
        return {
            ...base,
            ok: false,
            status: 'auth_failed',
            diagnostics: {
                host_resolved: true,
                tcp_connected: true,
                auth_passed: false,
                describe_passed: false,
                response_time_ms: responseTimeMs,
            },
            error: {
                code: 'auth_failed',
                message: 'RTSP authorization failed.',
            },
        };
    }

    if (
        pathToken.includes('missing') ||
        pathToken.includes('404') ||
        pathToken.includes('notfound')
    ) {
        return {
            ...base,
            ok: false,
            status: 'stream_not_found',
            diagnostics: {
                host_resolved: true,
                tcp_connected: true,
                auth_passed: true,
                describe_passed: false,
                response_time_ms: responseTimeMs,
            },
            error: {
                code: 'stream_not_found',
                message: 'RTSP stream path was not found.',
            },
        };
    }

    const vendor = inferVendorFromSource(source);
    const model = inferModelFromSource(source);
    const serial_number = inferSerialFromSource(source);
    const codec = pickFrom(CAMERA_CODEC_PARTS, hashText(source.host));
    const fps = 20 + (hashText(source.path) % 11);
    const width = (hashText(source.host + source.path) % 2) === 0 ? 1920 : 1280;
    const height = width === 1920 ? 1080 : 720;

    return {
        ...base,
        ok: true,
        status: 'ok',
        diagnostics: {
            host_resolved: true,
            tcp_connected: true,
            auth_passed: true,
            describe_passed: true,
            response_time_ms: responseTimeMs,
        },
        discovered_device: {
            vendor,
            model,
            serial_number,
            firmware_version:
                `v${1 + (hashText(source.host) % 4)}.${hashText(source.path) % 10}.${hashText(source.username) % 10}`,
        },
        discovered_stream: {
            codec,
            width,
            height,
            fps,
            has_video: true,
        },
    };
};

// -----------------------------------------------------------------------------
// state-independent camera derivation
// -----------------------------------------------------------------------------

const deriveRuntimeStateFromCameraStatus = (
    camera: CameraDto,
): MockCameraRuntimeStateRecord => {
    const cameraRecord = toRecord(camera);
    const cameraId = String(cameraRecord.id ?? '');
    const updatedAt = normalizeIsoString(
        cameraRecord.updated_at ?? cameraRecord.last_seen_at,
        getNowIso(),
    );
    const status = normalizeCameraStatus(cameraRecord.status);

    switch (status) {
        case CameraStatus.Online:
            return {
                camera_id: cameraId,
                provisioning_state: 'ready',
                connectivity_state: 'reachable',
                stream_state: 'streaming',
                last_check_at: updatedAt,
                last_success_at: updatedAt,
                response_time_ms: 180,
            };

        case CameraStatus.Problem:
            return {
                camera_id: cameraId,
                provisioning_state: 'ready',
                connectivity_state: 'reachable',
                stream_state: 'error',
                last_check_at: updatedAt,
                last_success_at: updatedAt,
                last_error_at: updatedAt,
                last_error_code: String(
                    cameraRecord.status_reason ?? CameraStatusReasonCode.HighLatency,
                ),
                last_error_message: 'Mock camera reports degraded stream quality.',
                response_time_ms: 850,
            };

        case CameraStatus.Initializing:
            return {
                camera_id: cameraId,
                provisioning_state: 'binding',
                connectivity_state: 'unknown',
                stream_state: 'starting',
                last_check_at: updatedAt,
                response_time_ms: 300,
            };

        case CameraStatus.Offline:
            return {
                camera_id: cameraId,
                provisioning_state: 'ready',
                connectivity_state: 'unreachable',
                stream_state: 'no_stream',
                last_check_at: updatedAt,
                last_error_at: updatedAt,
                last_error_code: String(
                    cameraRecord.status_reason ?? CameraStatusReasonCode.NoSignal,
                ),
                last_error_message: 'Mock camera host is unreachable.',
                response_time_ms: 0,
            };

        case CameraStatus.Unknown:
        default:
            return {
                camera_id: cameraId,
                provisioning_state: 'error',
                connectivity_state: 'unknown',
                stream_state: 'error',
                last_check_at: updatedAt,
                last_error_at: updatedAt,
                last_error_code: String(
                    cameraRecord.status_reason ?? CameraStatusReasonCode.Unknown,
                ),
                last_error_message: 'Unknown mock camera state.',
            };
    }
};

const deriveCameraSourceRecordsFromCameras = (
    cameras: CameraDto[],
): MockCameraSourceRecord[] => {
    return cameras.map((camera, index) => {
        const cameraRecord = toRecord(camera);
        const cameraId = String(cameraRecord.id ?? '');
        const host = `10.20.${(index % 20) + 1}.${(index % 200) + 20}`;
        const username = 'operator';
        const path = '/Streaming/Channels/101';
        const transport: MockCameraTransport = 'rtsp';

        return {
            camera_id: cameraId,
            transport,
            host,
            port: 554,
            path,
            username,
            password_secret_ref: createMockSecretRef(),
            credentials_set: true,
            use_tls: false,
            connect_timeout_ms: 4000,
            read_timeout_ms: 4000,
            source_fingerprint: buildSourceFingerprint({
                transport,
                host,
                port: 554,
                path,
                username,
                use_tls: false,
                query: undefined,
            }),
            created_at: normalizeIsoString(cameraRecord.created_at, getNowIso()),
            updated_at: normalizeIsoString(cameraRecord.updated_at, getNowIso()),
        };
    });
};

const deriveCameraRuntimeStateRecordsFromCameras = (
    cameras: CameraDto[],
): MockCameraRuntimeStateRecord[] =>
    cameras.map(deriveRuntimeStateFromCameraStatus);

const enrichCameraDtoFromMaps = (
    camera: CameraDto,
    sourceMap: Map<string, MockCameraSourceRecord>,
    runtimeMap: Map<string, MockCameraRuntimeStateRecord>,
    siteNameResolver?: (siteId: string) => string | undefined,
): CameraDto => {
    const current = toRecord(camera);
    const cameraId = String(current.id ?? '');
    const source = sourceMap.get(cameraId);
    const runtime = runtimeMap.get(cameraId);

    const derivedStatus = mapRuntimeToStatus(
        runtime,
        normalizeCameraStatus(current.status),
    );

    const derivedReason = mapRuntimeToReason(
        runtime,
        inferCameraStatusReason(current),
    );

    const siteId = String(current.site_id ?? '');

    return toCameraDto({
        ...current,
        site_name:
            normalizeSiteOptionalText(current.site_name) ??
            siteNameResolver?.(siteId),
        status: derivedStatus,
        status_reason: derivedReason,
        source_summary: buildCameraSourceSummary(source),
        diagnostics: buildCameraDiagnostics(runtime),
    });
};

// -----------------------------------------------------------------------------
// seed builders
// -----------------------------------------------------------------------------

const siteSeedsToDtos = (): SiteDto[] => {
    return SITE_SEEDS.map((site, index) => {
        return toSiteDto({
            id: site.id,
            code: site.code,
            name: site.name,
            timezone: site.timezone,
            region: site.region,
            address: deepClone(site.address),
            contact: deepClone(site.contact),
            tags: [...site.tags],
            created_at: isoDaysAgo(180 - index * 8, 10),
            updated_at: isoDaysAgo(index + 1, 11),
            config: {
                seeded: true,
            },
        });
    });
};

const buildSeedCameraBundle = (sites: SiteDto[]): {
    cameras: CameraDto[];
    cameraSources: MockCameraSourceRecord[];
    cameraRuntimeStates: MockCameraRuntimeStateRecord[];
} => {
    const cameras: CameraDto[] = [];
    const cameraSources: MockCameraSourceRecord[] = [];
    const cameraRuntimeStates: MockCameraRuntimeStateRecord[] = [];

    sites.forEach((site, siteIndex) => {
        const count = 4 + (siteIndex % 3);

        for (let i = 0; i < count; i += 1) {
            const id = `camera-${siteIndex + 1}-${i + 1}`;
            const status = pickFrom(CAMERA_STATUSES, siteIndex + i);
            const vendor = pickFrom(CAMERA_VENDOR_PARTS, siteIndex + i);
            const model = pickFrom(CAMERA_MODEL_PARTS, siteIndex + i);
            const serial_number = `SN-${siteIndex + 1}${i + 1}${1000 + siteIndex * 10 + i}`;

            const lastSeenAt =
                status === CameraStatus.Offline || status === CameraStatus.Unknown
                    ? isoDaysAgo(1 + ((siteIndex + i) % 3), 3 + i, 10)
                    : isoDaysAgo((siteIndex + i) % 2, 7 + i, 10);

            const createdAt = isoDaysAgo(160 - siteIndex * 7 - i, 9);
            const updatedAt = isoDaysAgo((siteIndex + i) % 5, 10);

            const host = `10.10.${siteIndex + 1}.${20 + i}`;
            const username = 'operator';
            const path = '/Streaming/Channels/101';
            const transport: MockCameraTransport = 'rtsp';

            const source: MockCameraSourceRecord = {
                camera_id: id,
                transport,
                host,
                port: 554,
                path,
                username,
                password_secret_ref: createMockSecretRef(),
                credentials_set: true,
                use_tls: false,
                connect_timeout_ms: 4000,
                read_timeout_ms: 4000,
                source_fingerprint: buildSourceFingerprint({
                    transport,
                    host,
                    port: 554,
                    path,
                    username,
                    use_tls: false,
                    query: undefined,
                }),
                created_at: createdAt,
                updated_at: updatedAt,
            };

            const baseCamera = toCameraDto({
                id,
                site_id: String((site as any).id),
                name: `${site.name} — ${pickFrom(CAMERA_NAME_PARTS, i)} ${i + 1}`,
                location: pickFrom(CAMERA_LOCATION_PARTS, siteIndex + i),
                vendor,
                model,
                serial_number,
                status,
                status_reason: inferCameraStatusReason({ status }),
                last_seen_at: lastSeenAt,
                created_at: createdAt,
                updated_at: updatedAt,
                site_name: String((site as any).name),
            });

            const runtime = deriveRuntimeStateFromCameraStatus(baseCamera);

            const camera = toCameraDto({
                ...toRecord(baseCamera),
                source_summary: buildCameraSourceSummary(source),
                diagnostics: buildCameraDiagnostics(runtime),
            });

            cameras.push(camera);
            cameraSources.push(source);
            cameraRuntimeStates.push(runtime);
        }
    });

    return {
        cameras,
        cameraSources,
        cameraRuntimeStates,
    };
};

// -----------------------------------------------------------------------------
// camera video mock assets
// -----------------------------------------------------------------------------

type MockCameraVideoMode = 'original' | 'processed';

const MOCK_VIDEO_ASSETS_BASE_URL = '/videos';

const MOCK_INCIDENT_PREVIEW_URL =
    `${MOCK_VIDEO_ASSETS_BASE_URL}/demo/live/poster.jpg`;

const MOCK_INCIDENT_CLIP_URL =
    `${MOCK_VIDEO_ASSETS_BASE_URL}/demo/live/raw.mp4`;

const toMockVideoAssetUrl = (
    relativePath: string | undefined,
): string | undefined => {
    if (!relativePath) {
        return undefined;
    }

    const normalizedPath = relativePath
        .replace(/\\/g, '/')
        .replace(/^\/+/, '');

    return `${MOCK_VIDEO_ASSETS_BASE_URL}/${normalizedPath}`;
};

const normalizeVideoMode = (
    value: PrimitiveQuery,
): MockCameraVideoMode =>
    asString(value) === 'processed'
        ? 'processed'
        : 'original';

const getCameraStreamPath = (
    mode: MockCameraVideoMode,
): string =>
    mode === 'processed'
        ? 'demo/live/annotated.mp4'
        : 'demo/live/raw.mp4';

// -----------------------------------------------------------------------------
// incident seed builder
// -----------------------------------------------------------------------------

const buildIncidents = (
    sites: SiteDto[],
    cameras: CameraDto[],
): IncidentDto[] => {
    const items: IncidentDto[] = [];
    let counter = 1;

    for (let day = 0; day < 35; day += 1) {
        for (let slot = 0; slot < 4; slot += 1) {
            const camera = cameras[(day * 5 + slot * 3) % cameras.length];
            const site =
                sites.find((item) =>
                    String((item as any).id) === String((camera as any).site_id),
                ) ?? sites[0];

            const incidentType = pickFrom(INCIDENT_TYPES, day + slot + 2);
            const severity = pickFrom(INCIDENT_SEVERITIES, day + slot + 1);
            const dataQualityStatus = pickFrom(
                INCIDENT_DATA_QUALITY_STATUSES,
                day + slot,
            );

            const eventDate = new Date(Date.now() - day * DAY_MS);
            eventDate.setHours(6 + slot * 4, 10 + (day % 30), 0, 0);

            const createdDate = new Date(eventDate.getTime() + 10 * 60 * 1000);
            const updatedDate = new Date(createdDate.getTime() + 60 * 60 * 1000);

            const confidence = Number(
                (0.58 + ((day + slot) % 35) * 0.01).toFixed(2),
            );

            const correlationIds =
                counter > 1 && counter % 6 === 0
                    ? [`incident-${counter - 1}`]
                    : [];

            items.push(toIncidentDto({
                id: `incident-${counter}`,
                event_id: `event-${counter}`,
                site_id: String((site as any).id),
                site_name: String((site as any).name),
                camera_id: String((camera as any).id),
                camera_name: String((camera as any).name),
                incident_type: incidentType,
                severity,
                confidence,
                event_time: eventDate.toISOString(),
                created_at: createdDate.toISOString(),
                updated_at: updatedDate.toISOString(),
                data_quality_status: dataQualityStatus,
                image_url: MOCK_INCIDENT_PREVIEW_URL,
                clip_url: MOCK_INCIDENT_CLIP_URL,
                tags: [
                    pickFrom(INCIDENT_TAG_POOL, counter),
                    pickFrom(INCIDENT_TAG_POOL, counter + 2),
                ],
                correlation_ids: correlationIds,
                bbox: {
                    x: 0.18,
                    y: 0.12,
                    width: 0.24,
                    height: 0.42,
                },
                extra: {
                    shift: slot < 2 ? 'day' : 'evening',
                },
            }));

            counter += 1;
        }
    }

    return items.sort((left, right) => {
        const leftTs = Date.parse(String((left as any).event_time ?? 0));
        const rightTs = Date.parse(String((right as any).event_time ?? 0));

        return rightTs - leftTs;
    });
};

// -----------------------------------------------------------------------------
// runtime-aware helpers with global state
// -----------------------------------------------------------------------------

let state!: MockDbState;

const findSiteById = (
    siteId: string,
): SiteDto | undefined =>
    state.sites.find((item) => String((item as any).id) === siteId);

const findSiteName = (
    siteId: string,
): string | undefined => {
    const site = findSiteById(siteId);
    return site ? String((site as any).name ?? '') : undefined;
};

const findCameraSourceByCameraId = (
    cameraId: string,
): MockCameraSourceRecord | undefined =>
    state.cameraSources.find((item) => item.camera_id === cameraId);

const findCameraRuntimeStateByCameraId = (
    cameraId: string,
): MockCameraRuntimeStateRecord | undefined =>
    state.cameraRuntimeStates.find((item) => item.camera_id === cameraId);

const getConnectionCheckByToken = (
    token: string,
): MockCameraConnectionCheckRecord | undefined =>
    state.cameraConnectionChecks.find((item) => item.token === token);

const enrichCameraDto = (
    camera: CameraDto,
): CameraDto => {
    const current = toRecord(camera);
    const cameraId = String(current.id ?? '');
    const source = findCameraSourceByCameraId(cameraId);
    const runtime = findCameraRuntimeStateByCameraId(cameraId);

    const derivedStatus = mapRuntimeToStatus(
        runtime,
        normalizeCameraStatus(current.status),
    );

    const derivedReason = mapRuntimeToReason(
        runtime,
        inferCameraStatusReason(current),
    );

    return toCameraDto({
        ...current,
        site_name:
            normalizeSiteOptionalText(current.site_name) ??
            findSiteName(String(current.site_id ?? '')),
        status: derivedStatus,
        status_reason: derivedReason,
        source_summary: buildCameraSourceSummary(source),
        diagnostics: buildCameraDiagnostics(runtime),
    });
};

const emitCameraMockRealtimeEvents = (
    camera: CameraDto,
    type: CameraMockRealtimeEventType,
): void => {
    const cameraId = String((camera as any).id);

    emitMockRealtimeEvent({
        channel: CAMERA_REALTIME_CHANNEL,
        type,
        payload: {
            type,
            camera: deepClone(camera),
        },
    });

    if (type !== 'status_changed') {
        return;
    }

    for (const mode of ['original', 'processed'] as const) {
        emitMockRealtimeEvent({
            channel: CAMERA_VIDEO_REALTIME_CHANNEL,
            type: 'stream_updated',
            payload: {
                type: 'stream_updated',
                cameraId,
                mode,
            },
        });
    }
};

const emitCameraStreamRefresh = (
    cameraId: string,
): void => {
    for (const mode of ['original', 'processed'] as const) {
        emitMockRealtimeEvent({
            channel: CAMERA_VIDEO_REALTIME_CHANNEL,
            type: 'stream_updated',
            payload: {
                type: 'stream_updated',
                cameraId,
                mode,
            },
        });
    }
};

const syncSiteReferences = (
    siteId: string,
): void => {
    const siteName = findSiteName(siteId);

    if (!siteName) {
        return;
    }

    state.cameras = state.cameras.map((item) => {
        const camera = toRecord(item);

        if (String(camera.site_id) !== siteId) {
            return item;
        }

        return toCameraDto({
            ...camera,
            site_name: siteName,
        });
    });

    state.incidents = state.incidents.map((item) => {
        const incident = toRecord(item);

        if (String(incident.site_id) !== siteId) {
            return item;
        }

        return toIncidentDto({
            ...incident,
            site_name: siteName,
        });
    });
};

const syncCameraPresentationFields = (
    cameraId: string,
): void => {
    const camera = state.cameras.find((item) => String((item as any).id) === cameraId);

    if (!camera) {
        return;
    }

    const cameraRecord = toRecord(camera);
    const cameraName = String(cameraRecord.name ?? '');
    const siteId = String(cameraRecord.site_id ?? '');
    const siteName = findSiteName(siteId) ?? String(cameraRecord.site_name ?? '');

    state.cameras = state.cameras.map((item) => {
        const current = toRecord(item);

        if (String(current.id) !== cameraId) {
            return item;
        }

        return toCameraDto({
            ...current,
            site_name: siteName,
        });
    });

    state.incidents = state.incidents.map((item) => {
        const incident = toRecord(item);

        if (String(incident.camera_id) !== cameraId) {
            return item;
        }

        return toIncidentDto({
            ...incident,
            camera_name: cameraName,
            site_id: siteId,
            site_name: siteName,
        });
    });
};

const persistMockDbState = (): void => {
    if (!canUseStorage()) {
        return;
    }

    try {
        window.localStorage.setItem(
            MOCK_DB_STORAGE_KEY,
            JSON.stringify(state),
        );
    } catch {
        // noop
    }
};

const removeExpiredCameraConnectionChecks = (): void => {
    const before = state.cameraConnectionChecks.length;

    state.cameraConnectionChecks = state.cameraConnectionChecks.filter(
        (item) => !isConnectionCheckExpired(item),
    );

    if (state.cameraConnectionChecks.length !== before) {
        persistMockDbState();
    }
};

const buildRuntimeStateForPatchedCamera = (args: {
    cameraId: string;
    status: CameraStatus;
    statusReason?: CameraStatusReasonCode;
    previous?: MockCameraRuntimeStateRecord;
}): MockCameraRuntimeStateRecord => {
    const {
        cameraId,
        status,
        statusReason,
        previous,
    } = args;

    const nowIso = getNowIso();

    const base: MockCameraRuntimeStateRecord = {
        camera_id: cameraId,
        provisioning_state: previous?.provisioning_state ?? 'ready',
        connectivity_state: previous?.connectivity_state ?? 'unknown',
        stream_state: previous?.stream_state ?? 'error',
        last_check_at: nowIso,
        last_success_at: previous?.last_success_at,
        last_error_at: previous?.last_error_at,
        last_error_code: previous?.last_error_code,
        last_error_message: previous?.last_error_message,
        response_time_ms: previous?.response_time_ms ?? 200,
    };

    switch (status) {
        case CameraStatus.Online:
            return {
                ...base,
                provisioning_state: 'ready',
                connectivity_state: 'reachable',
                stream_state: 'streaming',
                last_success_at: nowIso,
                last_error_at: undefined,
                last_error_code: undefined,
                last_error_message: undefined,
            };

        case CameraStatus.Offline:
            return {
                ...base,
                provisioning_state: 'ready',
                connectivity_state: 'unreachable',
                stream_state: 'no_stream',
                last_error_at: nowIso,
                last_error_code: String(statusReason ?? 'no_signal'),
                last_error_message: 'Mock camera marked offline.',
            };

        case CameraStatus.Problem:
            return {
                ...base,
                provisioning_state: 'ready',
                connectivity_state: 'reachable',
                stream_state: 'error',
                last_error_at: nowIso,
                last_error_code: String(statusReason ?? 'stream_unavailable'),
                last_error_message: 'Mock camera marked problematic.',
            };

        case CameraStatus.Initializing:
            return {
                ...base,
                provisioning_state: 'binding',
                connectivity_state: 'unknown',
                stream_state: 'starting',
            };

        case CameraStatus.Unknown:
        default:
            return {
                ...base,
                provisioning_state: 'error',
                connectivity_state: 'unknown',
                stream_state: 'error',
                last_error_at: nowIso,
                last_error_code: String(statusReason ?? 'unknown'),
                last_error_message: 'Mock camera marked unknown.',
            };
    }
};

// -----------------------------------------------------------------------------
// initialization
// -----------------------------------------------------------------------------

const createInitialState = (): MockDbState => {
    const rawSites = siteSeedsToDtos();
    const seedBundle = buildSeedCameraBundle(rawSites);
    const incidents = buildIncidents(rawSites, seedBundle.cameras);
    const sites = rawSites;

    return {
        sites,
        cameras: seedBundle.cameras,
        incidents,
        cameraSources: seedBundle.cameraSources,
        cameraRuntimeStates: seedBundle.cameraRuntimeStates,
        cameraConnectionChecks: [],
    };
};

const loadMockDbState = (): MockDbState | null => {
    if (!canUseStorage()) {
        return null;
    }

    try {
        const raw = window.localStorage.getItem(MOCK_DB_STORAGE_KEY);

        if (!raw) {
            return null;
        }

        const parsed = JSON.parse(raw) as Partial<MockDbState>;

        if (
            !parsed ||
            !Array.isArray(parsed.sites) ||
            !Array.isArray(parsed.cameras) ||
            !Array.isArray(parsed.incidents)
        ) {
            return null;
        }

        const sites = (parsed.sites as SiteDto[]).map((item) =>
            normalizeLoadedSiteDto(toRecord(item)),
        );

        const siteNameResolver = (siteId: string): string | undefined =>
            findSiteNameInCollection(sites, siteId);

        const cameras = (parsed.cameras as CameraDto[]).map((item) => {
            const rawCamera = toRecord(item);
            const siteId = normalizeSiteOptionalText(rawCamera.site_id ?? rawCamera.siteId) ?? '';
            return normalizeLoadedCameraDto(rawCamera, siteNameResolver(siteId));
        });

        const incidents = (parsed.incidents as IncidentDto[]).map(
            (item) => item as IncidentDto,
        );

        const cameraSources = Array.isArray((parsed as any).cameraSources)
            ? ((parsed as any).cameraSources as unknown[])
                .map((item) => normalizeLoadedCameraSourceRecord(toRecord(item)))
                .filter((item): item is MockCameraSourceRecord => Boolean(item))
            : deriveCameraSourceRecordsFromCameras(cameras);

        const cameraRuntimeStates = Array.isArray((parsed as any).cameraRuntimeStates)
            ? ((parsed as any).cameraRuntimeStates as unknown[])
                .map((item) => normalizeLoadedCameraRuntimeStateRecord(toRecord(item)))
                .filter((item): item is MockCameraRuntimeStateRecord => Boolean(item))
            : deriveCameraRuntimeStateRecordsFromCameras(cameras);

        const cameraConnectionChecks = Array.isArray((parsed as any).cameraConnectionChecks)
            ? ((parsed as any).cameraConnectionChecks as unknown[])
                .map((item) => normalizeLoadedCameraConnectionCheckRecord(toRecord(item)))
                .filter((item): item is MockCameraConnectionCheckRecord => Boolean(item))
                .filter((item) => !isConnectionCheckExpired(item))
            : [];

        const sourceMap = new Map(
            cameraSources.map((item) => [item.camera_id, item] as const),
        );
        const runtimeMap = new Map(
            cameraRuntimeStates.map((item) => [item.camera_id, item] as const),
        );

        const enrichedCameras = cameras.map((camera) =>
            enrichCameraDtoFromMaps(
                camera,
                sourceMap,
                runtimeMap,
                siteNameResolver,
            ),
        );

        return {
            sites,
            cameras: enrichedCameras,
            incidents,
            cameraSources,
            cameraRuntimeStates,
            cameraConnectionChecks,
        };
    } catch {
        return null;
    }
};

state = loadMockDbState() ?? createInitialState();

export const resetMockDb = (): void => {
    state = createInitialState();
    persistMockDbState();
};

export const getMockDbSnapshot = (): MockDbState =>
    deepClone(state);

// -----------------------------------------------------------------------------
// sites
// -----------------------------------------------------------------------------

const applySitePatchToRecord = (
    current: Record<string, unknown>,
    patch: Record<string, unknown>,
): Record<string, unknown> => {
    const next: Record<string, unknown> = {
        ...current,
        updated_at: getNowIso(),
    };

    if (hasOwnKey(patch, 'name')) {
        const name = normalizeSiteOptionalText(patch.name);
        if (name) {
            next.name = name;
        }
    }

    if (hasOwnKey(patch, 'code')) {
        const code = normalizeSiteNullableText(patch.code);
        if (code === null) {
            delete next.code;
        } else if (typeof code === 'string') {
            next.code = code;
        }
    }

    if (hasOwnKey(patch, 'timezone')) {
        const timezone = normalizeSiteNullableText(patch.timezone);
        if (timezone === null) {
            delete next.timezone;
        } else if (typeof timezone === 'string') {
            next.timezone = timezone;
        }
    }

    if (hasOwnKey(patch, 'region')) {
        const region = normalizeSiteNullableText(patch.region);
        if (region === null) {
            delete next.region;
        } else if (typeof region === 'string') {
            next.region = region;
        }
    }

    if (hasOwnKey(patch, 'address')) {
        const address = patch.address === null
            ? null
            : normalizeSiteAddressValue(patch.address, next.region);

        if (address === null) {
            delete next.address;
        } else if (address) {
            next.address = address;
        } else {
            delete next.address;
        }
    }

    if (hasOwnKey(patch, 'contact')) {
        const contact = patch.contact === null
            ? null
            : normalizeSiteContactValue(patch.contact);

        if (contact === null) {
            delete next.contact;
        } else if (contact) {
            next.contact = contact;
        } else {
            delete next.contact;
        }
    }

    if (hasOwnKey(patch, 'tags')) {
        const tags = normalizeSiteStringArray(patch.tags);
        if (tags && tags.length > 0) {
            next.tags = tags;
        } else {
            delete next.tags;
        }
    }

    if (hasOwnKey(patch, 'config')) {
        if (patch.config == null) {
            delete next.config;
        } else {
            next.config = patch.config;
        }
    }

    return next;
};

export const getSiteById = (
    id: string,
): SiteDto | undefined => {
    const found = state.sites.find((item) => String((item as any).id) === id);
    return found ? deepClone(found) : undefined;
};

export const listSites = (
    query: QueryLike,
): SiteListResponseDto => {
    const siteIds = asArray(query.site_ids);
    const regions = asArray(query.region);
    const timezones = asArray(query.timezone);
    const tags = asArray(query.tags);
    const search = normalizeSearch(query.search);

    let items = [...state.sites];

    items = items.filter((item) => {
        const site = item as any;
        const address =
            typeof site.address === 'object' && site.address !== null
                ? site.address
                : undefined;

        if (siteIds.length && !siteIds.includes(String(site.id))) {
            return false;
        }

        if (!includesValue(site.region, regions)) {
            return false;
        }

        if (!includesValue(site.timezone, timezones)) {
            return false;
        }

        if (!includesAny(site.tags, tags)) {
            return false;
        }

        return containsText(
            [
                site.name,
                site.code,
                site.region,
                site.timezone,
                address?.city,
                address?.address_line1,
                address?.postal_code,
            ],
            search,
        );
    });

    const paged = paginate(items, query);

    return {
        items: deepClone(paged.items),
        meta: paged.meta,
    } as unknown as SiteListResponseDto;
};

export const createSite = (
    payload: SiteCreateDto,
): SiteDto => {
    const nowIso = getNowIso();
    const name = normalizeSiteOptionalText(payload.name) ?? 'Новая площадка';
    const code = normalizeSiteOptionalText(payload.code);
    const region = normalizeSiteOptionalText(payload.region);
    const timezone = normalizeSiteOptionalText(payload.timezone);
    const address = normalizeSiteAddressValue(payload.address, region);
    const contact = normalizeSiteContactValue(payload.contact);
    const tags = normalizeSiteStringArray(payload.tags);

    const site = toSiteDto({
        id: createMockSiteId(),
        name,
        code,
        timezone,
        region,
        address,
        contact,
        tags,
        created_at: nowIso,
        updated_at: nowIso,
        config: payload.config,
    });

    state.sites.unshift(site);
    persistMockDbState();

    return deepClone(state.sites[0]);
};

export const patchSite = (
    id: string,
    patch: SitePatchDto,
): SiteDto | undefined => {
    const index = state.sites.findIndex((item) => String((item as any).id) === id);

    if (index < 0) {
        return undefined;
    }

    const current = toRecord(state.sites[index]);
    const next = applySitePatchToRecord(
        current,
        (patch ?? {}) as Record<string, unknown>,
    );

    state.sites[index] = toSiteDto(next);
    syncSiteReferences(id);
    persistMockDbState();

    return deepClone(state.sites[index]);
};

export const deleteSite = (
    id: string,
): DeleteSiteResult => {
    const exists = state.sites.some((item) => String((item as any).id) === id);

    if (!exists) {
        return { ok: false, reason: 'not_found' };
    }

    const deletedCameraIds = new Set(
        state.cameras
            .filter((item) => String((item as any).site_id) === id)
            .map((item) => String((item as any).id)),
    );

    state.sites = state.sites.filter((item) => String((item as any).id) !== id);

    state.cameras = state.cameras.filter(
        (item) => !deletedCameraIds.has(String((item as any).id)),
    );

    state.incidents = state.incidents.filter((item) => {
        const incidentSiteId = String((item as any).site_id);
        const incidentCameraId = String((item as any).camera_id);

        return (
            incidentSiteId !== id &&
            !deletedCameraIds.has(incidentCameraId)
        );
    });

    state.cameraSources = state.cameraSources.filter(
        (item) => !deletedCameraIds.has(item.camera_id),
    );

    state.cameraRuntimeStates = state.cameraRuntimeStates.filter(
        (item) => !deletedCameraIds.has(item.camera_id),
    );

    state.cameraConnectionChecks = state.cameraConnectionChecks.filter((item) => {
        if (item.site_id === id) {
            return false;
        }

        return !(item.camera_id && deletedCameraIds.has(item.camera_id));


    });

    persistMockDbState();

    return { ok: true };
};

export const getSiteMetrics = (
    query: QueryLike,
): SiteMetricsDto => {
    const filtered = (listSites({
        ...query,
        page: 1,
        pageSize: state.sites.length || 1,
    }).items ?? []) as any[];

    const byRegion = groupCount(filtered, (item) => item.region)
        .map((item) => makeBucket('region', item.key, item.count));

    return {
        total_count: filtered.length,
        by_region: byRegion,
    } as unknown as SiteMetricsDto;
};

// -----------------------------------------------------------------------------
// cameras
// -----------------------------------------------------------------------------

export const getCameraById = (
    id: string,
): CameraDto | undefined => {
    removeExpiredCameraConnectionChecks();

    const found = state.cameras.find((item) => String((item as any).id) === id);
    return found ? deepClone(enrichCameraDto(found)) : undefined;
};

export const listCameras = (
    query: QueryLike,
): CameraListResponseDto => {
    removeExpiredCameraConnectionChecks();

    const siteId = asString(query.site_id);
    const statuses = asArray(query.status);
    const search = normalizeSearch(query.search);

    let items = state.cameras.map(enrichCameraDto);

    items = items.filter((item) => {
        const camera = item as any;

        if (siteId && String(camera.site_id) !== siteId) {
            return false;
        }

        if (!includesValue(camera.status, statuses)) {
            return false;
        }

        return containsText(
            [
                camera.id,
                camera.name,
                camera.location,
                camera.vendor,
                camera.model,
                camera.serial_number,
                camera.site_id,
                camera.site_name,
                camera.source_summary?.host,
                camera.source_summary?.path,
            ],
            search,
        );
    });

    const paged = paginate(items, query);

    return {
        items: deepClone(paged.items),
        meta: paged.meta,
    } as unknown as CameraListResponseDto;
};

export const createCameraConnectionCheck = (
    payload: Record<string, unknown>,
): CreateCameraConnectionCheckResult => {
    removeExpiredCameraConnectionChecks();

    const siteId = normalizeSiteOptionalText(payload.site_id) ?? '';
    const name = normalizeSiteOptionalText(payload.name) ?? '';
    const location = normalizeSiteOptionalText(payload.location) ?? '';
    const source = normalizeConnectionSource(payload.source);

    const evaluated = evaluateConnectionCheck({
        siteId,
        name,
        location,
        source,
    });

    const createdAt = getNowIso();
    const expiresAt = new Date(
        Date.now() + CAMERA_CONNECTION_CHECK_TTL_MS,
    ).toISOString();

    const token = createMockConnectionCheckToken();

    state.cameraConnectionChecks.unshift({
        token,
        site_id: evaluated.site_id,
        name: evaluated.name,
        location: evaluated.location,
        source: evaluated.source,
        status: evaluated.status,
        ok: evaluated.ok,
        diagnostics: evaluated.diagnostics,
        discovered_device: evaluated.discovered_device,
        discovered_stream: evaluated.discovered_stream,
        error: evaluated.error,
        used: false,
        created_at: createdAt,
        expires_at: expiresAt,
    });

    persistMockDbState();

    if (!evaluated.ok) {
        return {
            ok: false,
            status: evaluated.status,
            diagnostics: evaluated.diagnostics,
            error: evaluated.error,
        };
    }

    return {
        ok: true,
        status: 'ok',
        check_token: token,
        diagnostics: evaluated.diagnostics,
        discovered_device: evaluated.discovered_device,
        discovered_stream: evaluated.discovered_stream,
    };
};

export const createCamera = (
    payload: CameraCreateDto,
): CreateCameraResult => {
    removeExpiredCameraConnectionChecks();

    const raw = payload as unknown as Record<string, unknown>;

    const siteId = normalizeSiteOptionalText(raw.site_id) ?? '';
    const name = normalizeSiteOptionalText(raw.name) ?? 'Новая камера';
    const location = normalizeSiteOptionalText(raw.location) ?? 'Не указано';
    const connectionCheckToken = normalizeSiteOptionalText(
        raw.connection_check_token,
    );

    const siteName = findSiteName(siteId);

    if (!siteName) {
        return {
            ok: false,
            reason: 'site_not_found',
            siteId,
        };
    }

    if (!connectionCheckToken) {
        return {
            ok: false,
            reason: 'invalid_connection_check_token',
        };
    }

    const connectionCheck = getConnectionCheckByToken(connectionCheckToken);

    if (!connectionCheck) {
        return {
            ok: false,
            reason: 'invalid_connection_check_token',
        };
    }

    if (isConnectionCheckExpired(connectionCheck)) {
        return {
            ok: false,
            reason: 'expired_connection_check_token',
        };
    }

    if (!connectionCheck.ok || connectionCheck.used) {
        return {
            ok: false,
            reason: 'connection_check_not_passed',
        };
    }

    if (connectionCheck.site_id !== siteId) {
        return {
            ok: false,
            reason: 'invalid_connection_check_token',
        };
    }

    const sourceFingerprint = buildSourceFingerprint(connectionCheck.source);

    const duplicate = state.cameraSources.some(
        (item) => item.source_fingerprint === sourceFingerprint,
    );

    if (duplicate) {
        return {
            ok: false,
            reason: 'duplicate_source',
        };
    }

    const deviceOverrides =
        raw.device_overrides &&
        typeof raw.device_overrides === 'object' &&
        !Array.isArray(raw.device_overrides)
            ? raw.device_overrides as Record<string, unknown>
            : {};

    const vendor =
        normalizeSiteOptionalText(deviceOverrides.vendor) ??
        normalizeSiteOptionalText(connectionCheck.discovered_device?.vendor);

    const model =
        normalizeSiteOptionalText(deviceOverrides.model) ??
        normalizeSiteOptionalText(connectionCheck.discovered_device?.model) ??
        normalizeSiteOptionalText(raw.model) ??
        'RTSP камера';

    const serial_number =
        normalizeSiteOptionalText(deviceOverrides.serial_number) ??
        normalizeSiteOptionalText(connectionCheck.discovered_device?.serial_number) ??
        normalizeSiteOptionalText(raw.serial_number) ??
        'N/A';

    const nowIso = getNowIso();
    const cameraId = createMockCameraId();

    const source: MockCameraSourceRecord = {
        camera_id: cameraId,
        transport: connectionCheck.source.transport,
        host: connectionCheck.source.host,
        port: connectionCheck.source.port,
        path: connectionCheck.source.path,
        username: connectionCheck.source.username,
        password_secret_ref: createMockSecretRef(),
        credentials_set: true,
        use_tls: connectionCheck.source.use_tls,
        connect_timeout_ms: connectionCheck.source.connect_timeout_ms,
        read_timeout_ms: connectionCheck.source.read_timeout_ms,
        source_fingerprint: sourceFingerprint,
        created_at: nowIso,
        updated_at: nowIso,
    };

    const runtime: MockCameraRuntimeStateRecord = {
        camera_id: cameraId,
        provisioning_state: 'ready',
        connectivity_state: 'reachable',
        stream_state: 'streaming',
        last_check_at: nowIso,
        last_success_at: nowIso,
        response_time_ms: connectionCheck.diagnostics?.response_time_ms,
    };

    const camera = toCameraDto({
        id: cameraId,
        site_id: siteId,
        name,
        location,
        vendor,
        model,
        serial_number,
        status: CameraStatus.Online,
        status_reason: undefined,
        last_seen_at: nowIso,
        created_at: nowIso,
        updated_at: nowIso,
        site_name: siteName,
        source_summary: buildCameraSourceSummary(source),
        diagnostics: buildCameraDiagnostics(runtime),
    });

    state.cameras.unshift(camera);
    state.cameraSources.unshift(source);
    state.cameraRuntimeStates.unshift(runtime);

    state.cameraConnectionChecks = state.cameraConnectionChecks.map((item) => {
        if (item.token !== connectionCheckToken) {
            return item;
        }

        return {
            ...item,
            used: true,
            used_at: nowIso,
            camera_id: cameraId,
        };
    });

    persistMockDbState();

    const savedCamera = enrichCameraDto(camera);

    emitCameraMockRealtimeEvents(savedCamera, 'updated');
    emitCameraStreamRefresh(cameraId);

    return {
        ok: true,
        camera: deepClone(savedCamera),
    };
};

const normalizeCameraPatch = (
    patch: Record<string, unknown>,
): Record<string, unknown> => {
    const next: Record<string, unknown> = { ...patch };

    if ('siteId' in next && !('site_id' in next)) {
        next.site_id = next.siteId;
    }

    if ('serialNumber' in next && !('serial_number' in next)) {
        next.serial_number = next.serialNumber;
    }

    delete next.siteId;
    delete next.serialNumber;

    return next;
};

const isCameraOperationalPatch = (
    patch: Record<string, unknown>,
): boolean =>
    ['status', 'status_reason', 'last_seen_at']
        .some((key) => hasOwnKey(patch, key));

const resolveCameraMockLastSeenAt = (args: {
    next: Record<string, unknown>;
    current: Record<string, unknown>;
    patch: Record<string, unknown>;
}): string | null => {
    const {
        next,
        current,
        patch,
    } = args;

    if (hasOwnKey(patch, 'last_seen_at')) {
        return normalizeNullableIsoString(next.last_seen_at, null);
    }

    const nextStatus = normalizeCameraStatus(next.status);

    if (nextStatus === CameraStatus.Offline || nextStatus === CameraStatus.Unknown) {
        return normalizeNullableIsoString(current.last_seen_at, null);
    }

    if (isCameraOperationalPatch(patch)) {
        return getNowIso();
    }

    return normalizeNullableIsoString(current.last_seen_at, getNowIso());
};

export const patchCamera = (
    id: string,
    patch: LegacyCameraPatchDto,
): CameraDto | undefined => {
    const index = state.cameras.findIndex((item) => String((item as any).id) === id);

    if (index < 0) {
        return undefined;
    }

    const current = toRecord(state.cameras[index]);
    const normalizedPatch = normalizeCameraPatch(
        (patch ?? {}) as Record<string, unknown>,
    );
    const nextSiteId = String(normalizedPatch.site_id ?? current.site_id ?? '');
    const nextSiteName = findSiteName(nextSiteId) ?? String(current.site_name ?? '');
    const nextStatus = normalizeCameraStatus(
        normalizedPatch.status ?? current.status,
    );

    const next: Record<string, unknown> = {
        ...current,
        ...normalizedPatch,
        site_id: nextSiteId,
        site_name: nextSiteName,
        status: nextStatus,
        updated_at: getNowIso(),
    };

    if (hasOwnKey(normalizedPatch, 'status_reason')) {
        next.status_reason = normalizeCameraStatusReason(
            normalizedPatch.status_reason,
        );
    } else {
        next.status_reason = inferCameraStatusReason(next);
    }

    next.last_seen_at = resolveCameraMockLastSeenAt({
        next,
        current,
        patch: normalizedPatch,
    });

    state.cameras[index] = toCameraDto(next);

    if (isCameraOperationalPatch(normalizedPatch)) {
        const previousRuntime = findCameraRuntimeStateByCameraId(id);
        const nextRuntime = buildRuntimeStateForPatchedCamera({
            cameraId: id,
            status: nextStatus,
            statusReason: normalizeCameraStatusReason(next.status_reason),
            previous: previousRuntime,
        });

        const runtimeIndex = state.cameraRuntimeStates.findIndex(
            (item) => item.camera_id === id,
        );

        if (runtimeIndex >= 0) {
            state.cameraRuntimeStates[runtimeIndex] = nextRuntime;
        } else {
            state.cameraRuntimeStates.unshift(nextRuntime);
        }
    }

    syncCameraPresentationFields(id);
    persistMockDbState();

    const savedCamera = deepClone(enrichCameraDto(state.cameras[index]));
    const eventType: CameraMockRealtimeEventType = isCameraOperationalPatch(normalizedPatch)
        ? 'status_changed'
        : 'updated';

    emitCameraMockRealtimeEvents(savedCamera, eventType);

    if (eventType === 'updated') {
        emitCameraStreamRefresh(id);
    }

    return savedCamera;
};

export const bulkUpdateCameras = (
    payload: LegacyCameraBulkUpdateDto,
): CameraListResponseDto => {
    const cameraIds = new Set(
        ((((payload as any)?.camera_ids ?? []) as unknown[]).map(String)),
    );

    const patch = normalizeCameraPatch(
        (((payload as any)?.patch ?? {}) as Record<string, unknown>),
    );

    const eventType: CameraMockRealtimeEventType = isCameraOperationalPatch(patch)
        ? 'status_changed'
        : 'updated';

    state.cameras = state.cameras.map((item) => {
        const camera = toRecord(item);

        if (!cameraIds.has(String(camera.id))) {
            return item;
        }

        const nextSiteId = String(patch.site_id ?? camera.site_id ?? '');
        const nextSiteName = findSiteName(nextSiteId) ?? String(camera.site_name ?? '');
        const nextStatus = normalizeCameraStatus(patch.status ?? camera.status);

        const next: Record<string, unknown> = {
            ...camera,
            ...patch,
            site_id: nextSiteId,
            site_name: nextSiteName,
            status: nextStatus,
            updated_at: getNowIso(),
        };

        if (hasOwnKey(patch, 'status_reason')) {
            next.status_reason = normalizeCameraStatusReason(patch.status_reason);
        } else {
            next.status_reason = inferCameraStatusReason(next);
        }

        next.last_seen_at = resolveCameraMockLastSeenAt({
            next,
            current: camera,
            patch,
        });

        return toCameraDto(next);
    });

    if (isCameraOperationalPatch(patch)) {
        const updatedRuntimeMap = new Map<string, MockCameraRuntimeStateRecord>();

        for (const cameraId of cameraIds) {
            const camera = state.cameras.find((item) => String((item as any).id) === cameraId);
            if (!camera) {
                continue;
            }

            const previousRuntime = findCameraRuntimeStateByCameraId(cameraId);
            const nextRuntime = buildRuntimeStateForPatchedCamera({
                cameraId,
                status: normalizeCameraStatus((camera as any).status),
                statusReason: normalizeCameraStatusReason((camera as any).status_reason),
                previous: previousRuntime,
            });

            updatedRuntimeMap.set(cameraId, nextRuntime);
        }

        state.cameraRuntimeStates = state.cameraRuntimeStates
            .filter((item) => !cameraIds.has(item.camera_id));

        state.cameraRuntimeStates.unshift(...updatedRuntimeMap.values());
    }

    for (const cameraId of cameraIds) {
        syncCameraPresentationFields(cameraId);
    }

    persistMockDbState();

    const items = state.cameras
        .filter((item) => cameraIds.has(String((item as any).id)))
        .map(enrichCameraDto);

    const clonedItems = deepClone(items);

    for (const camera of clonedItems) {
        emitCameraMockRealtimeEvents(camera, eventType);
    }

    return {
        items: clonedItems,
        meta: buildMeta(1, items.length || 1, items.length),
    } as unknown as CameraListResponseDto;
};

export const deleteCamera = (
    id: string,
): boolean => {
    const before = state.cameras.length;

    state.cameras = state.cameras.filter((item) => String((item as any).id) !== id);
    state.incidents = state.incidents.filter((item) => String((item as any).camera_id) !== id);
    state.cameraSources = state.cameraSources.filter((item) => item.camera_id !== id);
    state.cameraRuntimeStates = state.cameraRuntimeStates.filter((item) => item.camera_id !== id);

    state.cameraConnectionChecks = state.cameraConnectionChecks.map((item) => {
        if (item.camera_id !== id) {
            return item;
        }

        return {
            ...item,
            camera_id: undefined,
        };
    });

    const deleted = state.cameras.length < before;

    if (deleted) {
        persistMockDbState();
    }

    return deleted;
};

export const getCameraHealthMetrics = (
    id: string,
    query: QueryLike,
): Record<string, unknown> | undefined => {
    const camera = state.cameras.find((item) => String((item as any).id) === id);

    if (!camera) {
        return undefined;
    }

    const cameraAny = enrichCameraDto(camera) as any;
    const runtime = findCameraRuntimeStateByCameraId(id);
    const from = asString(query.from);
    const fromTs = from ? Date.parse(from) : Date.now() - 7 * DAY_MS;

    const recentIncidentCount = state.incidents.filter((incident) => {
        const current = incident as any;

        if (String(current.camera_id) !== id) {
            return false;
        }

        const eventTs = Date.parse(String(current.event_time ?? ''));

        return Number.isFinite(eventTs) && eventTs >= fromTs;
    }).length;

    const status = normalizeCameraStatus(cameraAny.status);

    return {
        camera_id: id,
        status,
        status_reason: cameraAny.status_reason,
        uptime_ratio:
            status === CameraStatus.Online
                ? 0.992
                : status === CameraStatus.Problem
                    ? 0.934
                    : status === CameraStatus.Initializing
                        ? 0.880
                        : status === CameraStatus.Unknown
                            ? undefined
                            : 0.781,
        recent_incident_count: recentIncidentCount,
        provisioning_state: runtime?.provisioning_state,
        connectivity_state: runtime?.connectivity_state,
        stream_state: runtime?.stream_state,
        updated_at: String(cameraAny.updated_at ?? cameraAny.last_seen_at ?? getNowIso()),
        response_time_ms: runtime?.response_time_ms,
    };
};

// -----------------------------------------------------------------------------
// camera video
// -----------------------------------------------------------------------------

const isCameraOriginalStreamAvailable = (
    camera: Record<string, unknown>,
): boolean => {
    const cameraId = String(camera.id ?? '');
    const source = findCameraSourceByCameraId(cameraId);

    if (!source || !source.credentials_set) {
        return false;
    }

    const status = normalizeCameraStatus(camera.status);

    return (
        status === CameraStatus.Online ||
        status === CameraStatus.Problem ||
        status === CameraStatus.Initializing
    );
};

const isCameraProcessedStreamAvailable = (
    camera: Record<string, unknown>,
): boolean => {
    const cameraId = String(camera.id ?? '');
    const source = findCameraSourceByCameraId(cameraId);

    if (!source || !source.credentials_set) {
        return false;
    }

    const status = normalizeCameraStatus(camera.status);

    return (
        status === CameraStatus.Online ||
        status === CameraStatus.Problem
    );
};

export const getCameraVideoStream = (
    id: string,
    query: QueryLike,
): CameraVideoStreamDto | undefined => {
    const camera = state.cameras.find(
        (item) => String((item as any).id) === id,
    );

    if (!camera) {
        return undefined;
    }

    const cameraRecord = toRecord(enrichCameraDto(camera));
    const mode = normalizeVideoMode(query.mode);

    const originalAvailable = isCameraOriginalStreamAvailable(cameraRecord);
    const processedAvailable = isCameraProcessedStreamAvailable(cameraRecord);
    const isAvailable = mode === 'processed'
        ? processedAvailable
        : originalAvailable;

    return {
        camera_id: id,
        mode,
        stream_url: isAvailable
            ? toMockVideoAssetUrl(getCameraStreamPath(mode))
            : undefined,
        is_available: isAvailable,
        processed_available: processedAvailable,
    };
};

// legacy alias
export const getCameraVideoSession = (
    id: string,
    query: QueryLike,
): Record<string, unknown> | undefined => {
    const dto = getCameraVideoStream(id, query);
    return dto ? { ...dto } : undefined;
};

// legacy alias
export const listCameraVideoSegments = (
    id: string,
): Array<Record<string, unknown>> | undefined => {
    const exists = state.cameras.some(
        (item) => String((item as any).id) === id,
    );

    return exists ? [] : undefined;
};

// -----------------------------------------------------------------------------
// incidents
// -----------------------------------------------------------------------------

export const getIncidentById = (
    id: string,
): IncidentDto | undefined => {
    const found = state.incidents.find((item) => String((item as any).id) === id);
    return found ? deepClone(found) : undefined;
};

function resolveIncidentSortField(
    field: string,
): string {
    switch (field) {
        case 'site':
            return 'site_name';
        case 'camera':
            return 'camera_name';
        default:
            return field;
    }
}

function compareIncidentValues(
    left: IncidentDto,
    right: IncidentDto,
    field: string,
    direction: 'asc' | 'desc',
): number {
    const multiplier = direction === 'asc' ? 1 : -1;
    const resolvedField = resolveIncidentSortField(field);

    const leftValue = (left as any)[resolvedField];
    const rightValue = (right as any)[resolvedField];

    if (resolvedField === 'severity') {
        const leftWeight = INCIDENT_SEVERITY_ORDER[leftValue as IncidentSeverity] ?? -1;
        const rightWeight = INCIDENT_SEVERITY_ORDER[rightValue as IncidentSeverity] ?? -1;

        if (leftWeight !== rightWeight) {
            return (leftWeight - rightWeight) * multiplier;
        }

        return 0;
    }

    if (resolvedField.includes('time') || resolvedField.endsWith('_at')) {
        const diff =
            Date.parse(String(leftValue ?? 0)) -
            Date.parse(String(rightValue ?? 0));

        if (diff !== 0) {
            return diff * multiplier;
        }

        return 0;
    }

    if (typeof leftValue === 'number' || typeof rightValue === 'number') {
        const diff = Number(leftValue ?? 0) - Number(rightValue ?? 0);

        if (diff !== 0) {
            return diff * multiplier;
        }

        return 0;
    }

    const compareResult = String(leftValue ?? '').localeCompare(
        String(rightValue ?? ''),
    );

    if (compareResult !== 0) {
        return compareResult * multiplier;
    }

    return 0;
}

const sortIncidents = (
    items: IncidentDto[],
    sortValues: string[],
): IncidentDto[] => {
    if (!sortValues.length) {
        return [...items].sort((left, right) =>
            Date.parse(String((right as any).event_time ?? 0)) -
            Date.parse(String((left as any).event_time ?? 0)),
        );
    }

    const sorted = [...items];

    sorted.sort((left, right) => {
        for (const raw of sortValues) {
            const [field, directionRaw] = String(raw).split(':');
            const direction = directionRaw === 'asc' ? 'asc' : 'desc';

            const diff = compareIncidentValues(left, right, field, direction);

            if (diff !== 0) {
                return diff;
            }
        }

        return 0;
    });

    return sorted;
};

export const listIncidents = (
    query: QueryLike,
): IncidentListResponseDto => {
    const siteIds = [...asArray(query.site_id), ...asArray(query.site_ids)];
    const cameraIds = [...asArray(query.camera_id), ...asArray(query.camera_ids)];
    const severities = [...asArray(query.severity), ...asArray(query.severities)];
    const types = [...asArray(query.incident_type), ...asArray(query.incident_types)];
    const tags = asArray(query.tags);
    const search = normalizeSearch(query.search);
    const from = asString(query.from);
    const to = asString(query.to);
    const minConfidence = asString(query.min_confidence);
    const maxConfidence = asString(query.max_confidence);
    const sortValues = asArray(query.sort);

    const fromTs = from ? Date.parse(from) : NaN;
    const toTs = to ? Date.parse(to) : NaN;
    const minConfidenceValue = minConfidence ? Number(minConfidence) : NaN;
    const maxConfidenceValue = maxConfidence ? Number(maxConfidence) : NaN;

    let items = [...state.incidents];

    items = items.filter((item) => {
        const incident = item as any;
        const eventTs = Date.parse(String(incident.event_time ?? 0));
        const confidence = Number(incident.confidence ?? 0);

        if (siteIds.length && !siteIds.includes(String(incident.site_id))) {
            return false;
        }

        if (cameraIds.length && !cameraIds.includes(String(incident.camera_id))) {
            return false;
        }

        if (!includesValue(incident.severity, severities)) {
            return false;
        }

        if (!includesValue(incident.incident_type, types)) {
            return false;
        }

        if (!includesAny(incident.tags, tags)) {
            return false;
        }

        if (
            !containsText(
                [
                    incident.id,
                    incident.event_id,
                    incident.site_name,
                    incident.camera_name,
                    incident.incident_type,
                    ...(incident.tags ?? []),
                ],
                search,
            )
        ) {
            return false;
        }

        if (Number.isFinite(fromTs) && eventTs < fromTs) {
            return false;
        }

        if (Number.isFinite(toTs) && eventTs > toTs) {
            return false;
        }

        if (Number.isFinite(minConfidenceValue) && confidence < minConfidenceValue) {
            return false;
        }

        return !(Number.isFinite(maxConfidenceValue) && confidence > maxConfidenceValue);
    });

    items = sortIncidents(items, sortValues);

    const paged = paginate(items, query);

    return {
        items: deepClone(paged.items),
        meta: paged.meta,
    } as unknown as IncidentListResponseDto;
};

export const getIncidentMetrics = (
    query: QueryLike,
): IncidentMetricsDto => {
    const filtered = (listIncidents({
        ...query,
        page: 1,
        pageSize: state.incidents.length,
    }).items ?? []) as any[];

    const bySeverity = groupCount(filtered, (item) => item.severity)
        .map((item) => makeBucket('severity', item.key, item.count));
    const byType = groupCount(filtered, (item) => item.incident_type)
        .map((item) => makeBucket('type', item.key, item.count));
    const bySite = groupCount(filtered, (item) => item.site_name)
        .map((item) => makeBucket('site', item.key, item.count));
    const byCamera = groupCount(filtered, (item) => item.camera_name)
        .map((item) => makeBucket('camera', item.key, item.count));

    return {
        total_count: filtered.length,
        by_severity: bySeverity,
        by_type: byType,
        by_site: bySite,
        by_camera: byCamera,
    } as unknown as IncidentMetricsDto;
};