// =====================
// shared/ui/classNames.ts
// =====================

/**
 * Внутренний helper для сборки className.
 * Не является частью публичного API shared/ui.
 */
export const joinClassNames = (
    ...values: ReadonlyArray<string | null | undefined | false>
): string => {
    return values.filter(Boolean).join(' ');
};