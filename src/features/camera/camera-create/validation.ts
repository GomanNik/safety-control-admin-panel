// =====================
// File: src/features/camera/camera-create/validation.ts
// Purpose:
//   Валидация формы создания камеры под реальный connection flow.
// =====================

import type {
    CameraCreateFormValues,
    CameraCreateValidationErrors,
    CameraCreateValidationResult,
} from './types';
import { normalizeCameraCreateFormValues } from './mappers';

const looksLikeEmpty = (
    value: unknown,
): boolean => {
    if (value == null) {
        return true;
    }

    if (typeof value === 'string') {
        return value.trim().length === 0;
    }

    return false;
};

const parsePositiveInteger = (
    value: string,
): number | null => {
    const parsed = Number(value);

    if (!Number.isFinite(parsed)) {
        return null;
    }

    if (!Number.isInteger(parsed)) {
        return null;
    }

    if (parsed <= 0) {
        return null;
    }

    return parsed;
};

export const validateCameraCreateForm = (
    values: CameraCreateFormValues,
): CameraCreateValidationResult => {
    const normalizedValues = normalizeCameraCreateFormValues(values);
    const errors: CameraCreateValidationErrors = {};

    if (looksLikeEmpty(normalizedValues.siteId)) {
        errors.siteId = 'required';
    }

    if (looksLikeEmpty(normalizedValues.name)) {
        errors.name = 'required';
    }

    if (looksLikeEmpty(normalizedValues.location)) {
        errors.location = 'required';
    }

    if (looksLikeEmpty(normalizedValues.host)) {
        errors.host = 'required';
    }

    if (looksLikeEmpty(normalizedValues.username)) {
        errors.username = 'required';
    }

    if (looksLikeEmpty(normalizedValues.password)) {
        errors.password = 'required';
    }

    if (looksLikeEmpty(normalizedValues.path)) {
        errors.path = 'required';
    }

    if (looksLikeEmpty(normalizedValues.port)) {
        errors.port = 'required';
    } else {
        const port = parsePositiveInteger(normalizedValues.port);

        if (port == null) {
            errors.port = 'invalid_number';
        } else if (port < 1 || port > 65535) {
            errors.port = 'out_of_range';
        }
    }

    if (looksLikeEmpty(normalizedValues.connectTimeoutMs)) {
        errors.connectTimeoutMs = 'required';
    } else {
        const connectTimeoutMs = parsePositiveInteger(normalizedValues.connectTimeoutMs);

        if (connectTimeoutMs == null) {
            errors.connectTimeoutMs = 'invalid_number';
        } else if (connectTimeoutMs < 500 || connectTimeoutMs > 120000) {
            errors.connectTimeoutMs = 'out_of_range';
        }
    }

    if (looksLikeEmpty(normalizedValues.readTimeoutMs)) {
        errors.readTimeoutMs = 'required';
    } else {
        const readTimeoutMs = parsePositiveInteger(normalizedValues.readTimeoutMs);

        if (readTimeoutMs == null) {
            errors.readTimeoutMs = 'invalid_number';
        } else if (readTimeoutMs < 500 || readTimeoutMs > 120000) {
            errors.readTimeoutMs = 'out_of_range';
        }
    }

    return {
        valid: Object.keys(errors).length === 0,
        errors,
        values: normalizedValues,
    };
};
