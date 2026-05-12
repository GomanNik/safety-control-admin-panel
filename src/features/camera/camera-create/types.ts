// =====================
// File: src/features/camera/camera-create/types.ts
// Purpose:
//   Типы feature-формы создания камеры под реальную двухэтапную модель:
//   - check connection
//   - create by verified token
// =====================

import type {
    Camera,
    CameraConnectionCheckResult,
} from '../../../entities/camera';

export interface CameraCreateFormValues {
    siteId: Camera['siteId'] | '';
    name: string;
    location: string;
    host: string;
    port: string;
    username: string;
    password: string;
    path: string;
    useTls: boolean;
    connectTimeoutMs: string;
    readTimeoutMs: string;
    vendor: string;
    model: string;
    serialNumber: string;
}

export type CameraCreateValidationFieldId =
    | 'siteId'
    | 'name'
    | 'location'
    | 'host'
    | 'port'
    | 'username'
    | 'password'
    | 'path'
    | 'connectTimeoutMs'
    | 'readTimeoutMs';

export type CameraCreateValidationErrorCode =
    | 'required'
    | 'invalid_number'
    | 'out_of_range';

export type CameraCreateValidationErrors = Partial<Record<
    CameraCreateValidationFieldId,
    CameraCreateValidationErrorCode
>>;

export interface CameraCreateValidationResult {
    valid: boolean;
    errors: CameraCreateValidationErrors;
    values: CameraCreateFormValues;
}

export type CameraCreateSubmitErrorCode =
    | 'check_failed'
    | 'create_failed'
    | 'verification_required';

export interface CameraCreateFormState {
    values: CameraCreateFormValues;
    errors: CameraCreateValidationErrors;

    isDirty: boolean;
    isValid: boolean;
    canCheck: boolean;
    canCreate: boolean;

    checking: boolean;
    creating: boolean;

    isVerified: boolean;
    requiresRecheck: boolean;

    checkResult: CameraConnectionCheckResult | null;
    checkError: unknown;
    checkErrorCode: CameraCreateSubmitErrorCode | null;

    createError: unknown;
    createErrorCode: CameraCreateSubmitErrorCode | null;

    setFieldValue<Name extends keyof CameraCreateFormValues>(
        name: Name,
        value: CameraCreateFormValues[Name],
    ): void;

    reset(): void;
    submitCheck(): Promise<CameraConnectionCheckResult | null>;
    submitCreate(): Promise<Camera | null>;
    submit(): Promise<Camera | null>;
}
