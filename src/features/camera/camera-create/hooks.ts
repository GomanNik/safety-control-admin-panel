// =====================
// File: src/features/camera/camera-create/hooks.ts
// Purpose:
//   Feature-hook формы создания камеры под двухэтапный flow:
//   - connection check
//   - create by verified token
//   Разделение ответственности:
//   frontend собирает и ведёт сценарий,
//   backend подтверждает источник и создаёт камеру.
// =====================

import {
    useCallback,
    useMemo,
    useState,
} from 'react';

import {
    useCameraConnectionCheckMutation,
    useCameraCreateMutation,
    type Camera,
    type CameraConnectionCheckResult,
} from '../../../entities/camera';

import { isMutationPending } from '../_shared/mutation';
import type {
    CameraCreateFormState,
    CameraCreateFormValues,
} from './types';
import {
    areCameraCreateFormValuesEqual,
    buildCameraCreateVerificationFingerprint,
    getCameraCreateCheckErrorCode,
    getCameraCreateErrorCode,
    getEmptyCameraCreateFormValues,
    mapCameraCreateFormValuesToConnectionCheckDto,
    mapCameraCreateFormValuesToDto,
} from './mappers';
import { validateCameraCreateForm } from './validation';

function createFlowError(
    code: string,
    message: string,
): {
    code: string;
    message: string;
} {
    return {
        code,
        message,
    };
}

export function useCameraCreateFormState(): CameraCreateFormState {
    const initialValues = useMemo(
        () => getEmptyCameraCreateFormValues(),
        [],
    );

    const [values, setValues] = useState<CameraCreateFormValues>(
        initialValues,
    );

    const [localCheckError, setLocalCheckError] = useState<unknown>(null);
    const [localCreateError, setLocalCreateError] = useState<unknown>(null);
    const [checkResult, setCheckResult] = useState<CameraConnectionCheckResult | null>(null);
    const [verifiedFingerprint, setVerifiedFingerprint] = useState<string | null>(null);

    const checkMutation = useCameraConnectionCheckMutation();
    const createMutation = useCameraCreateMutation();

    const validation = useMemo(
        () => validateCameraCreateForm(values),
        [values],
    );

    const isDirty = useMemo(
        () => !areCameraCreateFormValuesEqual(values, initialValues),
        [values, initialValues],
    );

    const verificationFingerprint = useMemo(
        () => buildCameraCreateVerificationFingerprint(values),
        [values],
    );

    const requiresRecheck = useMemo(
        () => (
            verifiedFingerprint != null &&
            verifiedFingerprint !== verificationFingerprint
        ),
        [verificationFingerprint, verifiedFingerprint],
    );

    const isVerified = useMemo(
        () => Boolean(
            checkResult?.ok &&
            checkResult.checkToken &&
            !requiresRecheck &&
            verifiedFingerprint === verificationFingerprint,
        ),
        [
            checkResult,
            requiresRecheck,
            verificationFingerprint,
            verifiedFingerprint,
        ],
    );

    const setFieldValue = useCallback(
        <Name extends keyof CameraCreateFormValues>(
            name: Name,
            value: CameraCreateFormValues[Name],
        ): void => {
            setValues((prev) => {
                const next: CameraCreateFormValues = {
                    ...prev,
                    [name]: value,
                };

                if (areCameraCreateFormValuesEqual(prev, next)) {
                    return prev;
                }

                return next;
            });

            if (localCheckError) {
                setLocalCheckError(null);
            }

            if (localCreateError) {
                setLocalCreateError(null);
            }

            if (checkMutation.error) {
                checkMutation.reset();
            }

            if (createMutation.error) {
                createMutation.reset();
            }
        },
        [
            checkMutation,
            createMutation,
            localCheckError,
            localCreateError,
        ],
    );

    const reset = useCallback((): void => {
        checkMutation.reset();
        createMutation.reset();

        setValues(initialValues);
        setLocalCheckError(null);
        setLocalCreateError(null);
        setCheckResult(null);
        setVerifiedFingerprint(null);
    }, [checkMutation, createMutation, initialValues]);

    const submitCheck = useCallback(async (): Promise<CameraConnectionCheckResult | null> => {
        if (checkMutation.error) {
            checkMutation.reset();
        }

        if (createMutation.error) {
            createMutation.reset();
        }

        setLocalCheckError(null);
        setLocalCreateError(null);

        const checked = validateCameraCreateForm(values);

        if (!checked.valid) {
            return null;
        }

        try {
            const result = await checkMutation.mutateAsync(
                mapCameraCreateFormValuesToConnectionCheckDto(checked.values),
            );

            setCheckResult(result);

            if (result.ok && result.checkToken) {
                setVerifiedFingerprint(
                    buildCameraCreateVerificationFingerprint(checked.values),
                );
                setLocalCheckError(null);
            } else {
                setVerifiedFingerprint(null);
                setLocalCheckError(
                    result.error ?? createFlowError(
                        'check_failed',
                        'Camera connection check failed',
                    ),
                );
            }

            return result;
        } catch {
            setCheckResult(null);
            setVerifiedFingerprint(null);
            return null;
        }
    }, [checkMutation, createMutation, values]);

    const submitCreate = useCallback(async (): Promise<Camera | null> => {
        if (createMutation.error) {
            createMutation.reset();
        }

        setLocalCreateError(null);

        const checked = validateCameraCreateForm(values);

        if (!checked.valid) {
            return null;
        }

        if (!checkResult?.ok || !checkResult.checkToken) {
            setLocalCreateError(
                createFlowError(
                    'verification_required',
                    'Camera connection must be verified before creation',
                ),
            );
            return null;
        }

        if (requiresRecheck || verifiedFingerprint !== buildCameraCreateVerificationFingerprint(checked.values)) {
            setLocalCreateError(
                createFlowError(
                    'verification_required',
                    'Camera parameters changed after verification. Re-check connection first',
                ),
            );
            return null;
        }

        try {
            const created = await createMutation.mutateAsync(
                mapCameraCreateFormValuesToDto(
                    checked.values,
                    checkResult.checkToken,
                ),
            );

            checkMutation.reset();
            createMutation.reset();

            setValues(initialValues);
            setLocalCheckError(null);
            setLocalCreateError(null);
            setCheckResult(null);
            setVerifiedFingerprint(null);

            return created ?? null;
        } catch {
            return null;
        }
    }, [
        checkMutation,
        checkResult,
        createMutation,
        initialValues,
        requiresRecheck,
        values,
        verifiedFingerprint,
    ]);

    const submit = useCallback(async (): Promise<Camera | null> => {
        return submitCreate();
    }, [submitCreate]);

    const checkError = localCheckError ?? checkMutation.error ?? null;
    const createError = localCreateError ?? createMutation.error ?? null;

    const canCheck = validation.valid && !isMutationPending(checkMutation);
    const canCreate = validation.valid && isVerified && !isMutationPending(createMutation);

    return useMemo<CameraCreateFormState>(
        () => ({
            values,
            errors: validation.errors,

            isDirty,
            isValid: validation.valid,
            canCheck,
            canCreate,

            checking: isMutationPending(checkMutation),
            creating: isMutationPending(createMutation),

            isVerified,
            requiresRecheck,

            checkResult,
            checkError,
            checkErrorCode: getCameraCreateCheckErrorCode(checkError),

            createError,
            createErrorCode: getCameraCreateErrorCode(createError),

            setFieldValue,
            reset,
            submitCheck,
            submitCreate,
            submit,
        }),
        [
            canCheck,
            canCreate,
            checkError,
            checkMutation,
            checkResult,
            createError,
            createMutation,
            isDirty,
            isVerified,
            requiresRecheck,
            reset,
            setFieldValue,
            submit,
            submitCheck,
            submitCreate,
            validation.errors,
            validation.valid,
            values,
        ],
    );
}
