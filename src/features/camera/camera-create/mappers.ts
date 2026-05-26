// =====================
// File: src/features/camera/camera-create/mappers.ts
// Purpose:
//   Мапперы формы создания камеры под двухэтапный flow:
//   - normalize form values
//   - form -> connection check dto
//   - form -> create dto
//   - error code resolution
// =====================

import type {
    CameraConnectionCheckRequestDto,
    CameraCreateDto,
} from '../../../entities/camera';
import type {
    CameraCreateFormValues,
    CameraCreateSubmitErrorCode,
} from './types';

const normalizeText = (
    value: unknown,
): string => {
    if (value == null) {
        return '';
    }

    return String(value).trim();
};

const normalizePath = (
    value: unknown,
): string => {
    const normalized = normalizeText(value);

    if (!normalized) {
        return '';
    }

    return normalized.startsWith('/')
        ? normalized
        : `/${normalized}`;
};

const normalizeNumericText = (
    value: unknown,
    fallback: string,
): string => {
    const normalized = normalizeText(value);

    return normalized || fallback;
};

const toOptionalOverride = (
    value: unknown,
): string | null | undefined => {
    const normalized = normalizeText(value);

    return normalized
        ? normalized
        : undefined;
};

export const getEmptyCameraCreateFormValues =
    (): CameraCreateFormValues => ({
        siteId: '',
        name: '',
        location: '',
        host: '',
        port: '554',
        username: '',
        password: '',
        path: '/Streaming/Channels/101',
        useTls: false,
        connectTimeoutMs: '3000',
        readTimeoutMs: '3000',
        vendor: '',
        model: '',
        serialNumber: '',
    });

export const normalizeCameraCreateFormValues = (
    values: CameraCreateFormValues,
): CameraCreateFormValues => ({
    siteId: normalizeText(values.siteId) as CameraCreateFormValues['siteId'],
    name: normalizeText(values.name),
    location: normalizeText(values.location),
    host: normalizeText(values.host),
    port: normalizeNumericText(values.port, '554'),
    username: normalizeText(values.username),
    password: String(values.password ?? ''),
    path: normalizePath(values.path),
    useTls: Boolean(values.useTls),
    connectTimeoutMs: normalizeNumericText(values.connectTimeoutMs, '3000'),
    readTimeoutMs: normalizeNumericText(values.readTimeoutMs, '3000'),
    vendor: normalizeText(values.vendor),
    model: normalizeText(values.model),
    serialNumber: normalizeText(values.serialNumber),
});

export const areCameraCreateFormValuesEqual = (
    left: CameraCreateFormValues,
    right: CameraCreateFormValues,
): boolean => {
    const a = normalizeCameraCreateFormValues(left);
    const b = normalizeCameraCreateFormValues(right);

    return (
        a.siteId === b.siteId &&
        a.name === b.name &&
        a.location === b.location &&
        a.host === b.host &&
        a.port === b.port &&
        a.username === b.username &&
        a.password === b.password &&
        a.path === b.path &&
        a.useTls === b.useTls &&
        a.connectTimeoutMs === b.connectTimeoutMs &&
        a.readTimeoutMs === b.readTimeoutMs &&
        a.vendor === b.vendor &&
        a.model === b.model &&
        a.serialNumber === b.serialNumber
    );
};

export const buildCameraCreateVerificationFingerprint = (
    values: CameraCreateFormValues,
): string => {
    const normalized = normalizeCameraCreateFormValues(values);

    return [
        normalized.siteId,
        normalized.name,
        normalized.location,
        normalized.host.toLowerCase(),
        normalized.port,
        normalized.username.toLowerCase(),
        normalized.password,
        normalized.path,
        String(normalized.useTls),
        normalized.connectTimeoutMs,
        normalized.readTimeoutMs,
    ].join('|');
};

export const mapCameraCreateFormValuesToConnectionCheckDto = (
    values: CameraCreateFormValues,
): CameraConnectionCheckRequestDto => {
    const normalized = normalizeCameraCreateFormValues(values);

    return {
        site_id: normalized.siteId as CameraConnectionCheckRequestDto['site_id'],
        name: normalized.name,
        location: normalized.location,
        source: {
            transport: 'rtsp',
            host: normalized.host,
            port: Number(normalized.port),
            username: normalized.username,
            password: normalized.password,
            path: normalized.path,
            use_tls: normalized.useTls,
            connect_timeout_ms: Number(normalized.connectTimeoutMs),
            read_timeout_ms: Number(normalized.readTimeoutMs),
        },
    };
};

export const mapCameraCreateFormValuesToDto = (
    values: CameraCreateFormValues,
    connectionCheckToken: string,
): CameraCreateDto => {
    const normalized = normalizeCameraCreateFormValues(values);

    return {
        site_id: normalized.siteId as CameraCreateDto['site_id'],
        name: normalized.name,
        location: normalized.location,
        connection_check_token: connectionCheckToken,
        device_overrides: {
            vendor: toOptionalOverride(normalized.vendor),
            model: toOptionalOverride(normalized.model),
            serial_number: toOptionalOverride(normalized.serialNumber),
        },
    };
};

export const getCameraCreateCheckErrorCode = (
    error: unknown,
): CameraCreateSubmitErrorCode | null => {
    if (!error) {
        return null;
    }

    const code = typeof error === 'object' && true && 'code' in error
        ? String((error as { code?: unknown }).code ?? '')
        : '';

    if (code === 'verification_required') {
        return 'verification_required';
    }

    return 'check_failed';
};

export const getCameraCreateErrorCode = (
    error: unknown,
): CameraCreateSubmitErrorCode | null => {
    if (!error) {
        return null;
    }

    const code = typeof error === 'object' && true && 'code' in error
        ? String((error as { code?: unknown }).code ?? '')
        : '';

    if (code === 'verification_required') {
        return 'verification_required';
    }

    return 'create_failed';
};
