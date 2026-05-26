// =====================
// File: src/widgets/sites/SiteFormWidget/SiteFormWidget.tsx
// Purpose:
// - Site create/edit form widget
// - Top row uses two columns: general data + address
// - Contact section is rendered below as a compact 2x2 grid
// - Action buttons are placed under contact fields inside the same card
// - Keeps address selection restricted to the official registry
// - Contact position is plain editable input until backend dictionary exists
// - Phone field uses controlled formatted input
// =====================

import {
    type ChangeEvent,
    type FormEvent,
    type JSX,
} from 'react';

import { useI18nContext } from '../../../shared/i18n';
import {
    Button,
    Card,
    Heading,
    Stack,
    Text,
} from '../../../shared/ui';

import type { AddressRegistryBuilding } from '../../../entities/address-registry';

import { useSiteFormWidget } from './hooks';
import type {
    SiteFormFieldName,
    SiteFormWidgetProps,
} from './types';

import styles from './ui/SiteFormWidget.module.css';

type SiteFormTextFieldName = Exclude<
    SiteFormFieldName,
    'addressSelection'
>;

function buildTextInputHandler<Name extends SiteFormTextFieldName>(
    name: Name,
    setFieldValue: (
        field: Name,
        value: string,
    ) => void,
    markTouched: (field: Name) => void,
) {
    return {
        onChange: (event: ChangeEvent<HTMLInputElement>) => {
            setFieldValue(name, event.target.value);
        },
        onBlur: () => {
            markTouched(name);
        },
    };
}

function renderAddressValue(
    value: string | null | undefined,
    fallbackLabel: string,
): string {
    return value && value.trim().length > 0
        ? value
        : fallbackLabel;
}

function formatAddressSuggestionMeta(
    suggestion: AddressRegistryBuilding,
): string {
    return [
        suggestion.region,
        suggestion.city ?? suggestion.settlement,
        suggestion.postalCode,
    ]
        .filter((value): value is string => Boolean(
            value && String(value).trim(),
        ))
        .join(' • ');
}

export function SiteFormWidget(
    props: SiteFormWidgetProps,
): JSX.Element {
    const { t } = useI18nContext();

    const {
        className,
        mode,
        siteId,
        onSaved,
        onCancel,
        ...rest
    } = props;

    const viewModel = useSiteFormWidget({
        mode,
        siteId,
        onSaved,
        onCancel,
    });

    const onSubmit = (
        event: FormEvent<HTMLFormElement>,
    ): void => {
        event.preventDefault();
        void viewModel.submit();
    };

    if (viewModel.isLoading) {
        return (
            <Card
                className={className}
                variant="default"
                padding="md"
                {...rest}
            >
                <div className={styles.centerState}>
                    <Text variant="muted">
                        {t('site.form.loading')}
                    </Text>
                </div>
            </Card>
        );
    }

    if (viewModel.loadError) {
        return (
            <Card
                className={className}
                variant="default"
                padding="md"
                {...rest}
            >
                <div className={styles.centerState}>
                    <Stack gap={8}>
                        <Heading level={3}>
                            {t('site.form.loadError.title')}
                        </Heading>

                        <Text variant="muted">
                            {viewModel.loadError}
                        </Text>
                    </Stack>
                </div>
            </Card>
        );
    }

    const shouldShowAddressSuggestions =
        viewModel.addressLookupActivated &&
        viewModel.values.addressQuery.trim().length >= 3 &&
        !viewModel.selectedAddress;

    const shouldShowAddressEmptyState =
        shouldShowAddressSuggestions &&
        !viewModel.addressLookupLoading &&
        !viewModel.addressLookupError &&
        viewModel.addressSuggestions.length === 0;

    const notAvailableLabel = t('common.notAvailable');

    return (
        <div
            className={[
                styles.root,
                className ?? '',
            ].filter(Boolean).join(' ')}
            {...rest}
        >
            <form onSubmit={onSubmit}>
                <Stack gap={16}>
                    <div className={styles.topRow}>
                        <Card
                            variant="default"
                            padding="md"
                            className={styles.topCard}
                            header={(
                                <div className={styles.sectionHeader}>
                                    <Heading level={2}>
                                        {viewModel.title}
                                    </Heading>

                                    <Text variant="muted">
                                        {viewModel.subtitle}
                                    </Text>
                                </div>
                            )}
                        >
                            <div className={styles.formGrid}>
                                <label className={`${styles.field} ${styles.fieldWide}`}>
                                    <Text
                                        variant="caption"
                                        className={styles.fieldLabel}
                                    >
                                        {t('site.form.fields.name')}
                                    </Text>

                                    <input
                                        className={[
                                            styles.control,
                                            viewModel.errors.name
                                                ? styles.controlError
                                                : '',
                                        ].filter(Boolean).join(' ')}
                                        placeholder={t('site.form.placeholders.name')}
                                        value={viewModel.values.name}
                                        autoComplete="organization"
                                        {...buildTextInputHandler(
                                            'name',
                                            viewModel.setFieldValue,
                                            viewModel.markFieldTouched,
                                        )}
                                    />

                                    {viewModel.errors.name ? (
                                        <Text className={styles.fieldError}>
                                            {viewModel.errors.name}
                                        </Text>
                                    ) : null}
                                </label>

                                <label className={styles.field}>
                                    <Text
                                        variant="caption"
                                        className={styles.fieldLabel}
                                    >
                                        {t('site.form.fields.code')}
                                    </Text>

                                    <input
                                        className={[
                                            styles.control,
                                            viewModel.errors.code
                                                ? styles.controlError
                                                : '',
                                        ].filter(Boolean).join(' ')}
                                        placeholder={t('site.form.placeholders.code')}
                                        value={viewModel.values.code}
                                        autoComplete="off"
                                        {...buildTextInputHandler(
                                            'code',
                                            viewModel.setFieldValue,
                                            viewModel.markFieldTouched,
                                        )}
                                    />

                                    <Text
                                        variant="caption"
                                        className={styles.fieldHint}
                                    >
                                        {viewModel.codeHelpText}
                                    </Text>

                                    <div className={styles.inlineActions}>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            disabled={!viewModel.canRegenerateCode || viewModel.isSaving}
                                            onClick={viewModel.regenerateCode}
                                        >
                                            {t('site.form.code.regenerate')}
                                        </Button>
                                    </div>

                                    {viewModel.errors.code ? (
                                        <Text className={styles.fieldError}>
                                            {viewModel.errors.code}
                                        </Text>
                                    ) : null}
                                </label>
                            </div>
                        </Card>

                        <Card
                            variant="default"
                            padding="md"
                            className={styles.topCard}
                            header={(
                                <div className={styles.sectionHeader}>
                                    <Heading level={3}>
                                        {t('site.form.sections.address.title')}
                                    </Heading>

                                    <Text variant="muted">
                                        {t('site.form.sections.address.subtitle')}
                                    </Text>
                                </div>
                            )}
                        >
                            <div className={styles.addressSearchBlock}>
                                <label className={styles.fieldFull}>
                                    <Text
                                        variant="caption"
                                        className={styles.fieldLabel}
                                    >
                                        {t('site.form.fields.addressQuery')}
                                    </Text>

                                    <div className={styles.addressSearchInputWrap}>
                                        <span
                                            className={styles.addressSearchIcon}
                                            aria-hidden="true"
                                        >
                                            ⌕
                                        </span>

                                        <input
                                            className={[
                                                styles.addressSearchInput,
                                                viewModel.errors.addressQuery
                                                    ? styles.controlError
                                                    : '',
                                            ].filter(Boolean).join(' ')}
                                            placeholder={t('site.form.placeholders.addressQuery')}
                                            value={viewModel.values.addressQuery}
                                            onChange={(event) => {
                                                viewModel.setAddressQuery(
                                                    event.target.value,
                                                );
                                            }}
                                            onBlur={() => {
                                                viewModel.markFieldTouched('addressQuery');
                                            }}
                                        />
                                    </div>

                                    <Text
                                        variant="caption"
                                        className={styles.addressHint}
                                    >
                                        {t('site.form.address.hint')}
                                    </Text>

                                    {viewModel.errors.addressQuery ? (
                                        <Text className={styles.fieldError}>
                                            {viewModel.errors.addressQuery}
                                        </Text>
                                    ) : null}
                                </label>

                                {viewModel.showLegacyAddressWarning ? (
                                    <div className={styles.registryWarning}>
                                        <Heading level={4}>
                                            {t('site.form.address.registryWarningTitle')}
                                        </Heading>

                                        <Text variant="muted">
                                            {t('site.form.address.registryWarningCurrent', {
                                                value: viewModel.legacyAddressText ?? notAvailableLabel,
                                            })}
                                        </Text>

                                        <Text variant="muted">
                                            {t('site.form.address.registryWarningBody')}
                                        </Text>
                                    </div>
                                ) : null}

                                {viewModel.addressLookupError ? (
                                    <div className={styles.lookupStateError}>
                                        <Text>
                                            {viewModel.addressLookupError}
                                        </Text>
                                    </div>
                                ) : null}

                                {viewModel.addressLookupLoading ? (
                                    <div className={styles.lookupState}>
                                        <Text variant="muted">
                                            {t('site.form.address.lookupLoading')}
                                        </Text>
                                    </div>
                                ) : null}

                                {shouldShowAddressSuggestions && viewModel.addressSuggestions.length > 0 ? (
                                    <div className={styles.addressSuggestionList}>
                                        {viewModel.addressSuggestions.map((suggestion) => (
                                            <button
                                                key={suggestion.id}
                                                type="button"
                                                className={styles.addressSuggestionItem}
                                                onClick={() => {
                                                    viewModel.selectAddressSuggestion(
                                                        suggestion,
                                                    );
                                                }}
                                            >
                                                <span className={styles.addressSuggestionItemCopy}>
                                                    <span className={styles.addressSuggestionPrimary}>
                                                        {suggestion.label}
                                                    </span>

                                                    <span className={styles.addressSuggestionSecondary}>
                                                        {formatAddressSuggestionMeta(suggestion)}
                                                    </span>
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                ) : null}

                                {shouldShowAddressEmptyState ? (
                                    <div className={styles.addressSearchEmpty}>
                                        {t('site.form.address.empty')}
                                    </div>
                                ) : null}

                                {viewModel.selectedAddress ? (
                                    <div className={styles.selectedAddressCard}>
                                        <div className={styles.selectedAddressHeader}>
                                            <div className={styles.selectedAddressHeaderCopy}>
                                                <Text
                                                    as="strong"
                                                    className={styles.selectedAddressTitle}
                                                >
                                                    {t('site.form.address.selectedTitle')}
                                                </Text>

                                                <Text className={styles.selectedAddressSummary}>
                                                    {viewModel.selectedAddress.label}
                                                </Text>
                                            </div>

                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={viewModel.clearSelectedAddress}
                                            >
                                                {t('site.form.address.clear')}
                                            </Button>
                                        </div>

                                        <div className={styles.selectedAddressGrid}>
                                            <div className={styles.selectedAddressCell}>
                                                <span className={styles.selectedAddressCellLabel}>
                                                    {t('site.form.address.region')}
                                                </span>

                                                <span className={styles.selectedAddressCellValue}>
                                                    {renderAddressValue(
                                                        viewModel.selectedAddress.region,
                                                        notAvailableLabel,
                                                    )}
                                                </span>
                                            </div>

                                            <div className={styles.selectedAddressCell}>
                                                <span className={styles.selectedAddressCellLabel}>
                                                    {t('site.form.address.cityOrSettlement')}
                                                </span>

                                                <span className={styles.selectedAddressCellValue}>
                                                    {renderAddressValue(
                                                        viewModel.selectedAddress.city ??
                                                        viewModel.selectedAddress.settlement,
                                                        notAvailableLabel,
                                                    )}
                                                </span>
                                            </div>

                                            <div className={styles.selectedAddressCell}>
                                                <span className={styles.selectedAddressCellLabel}>
                                                    {t('site.form.address.street')}
                                                </span>

                                                <span className={styles.selectedAddressCellValue}>
                                                    {renderAddressValue(
                                                        viewModel.selectedAddress.street,
                                                        notAvailableLabel,
                                                    )}
                                                </span>
                                            </div>

                                            <div className={styles.selectedAddressCell}>
                                                <span className={styles.selectedAddressCellLabel}>
                                                    {t('site.form.address.house')}
                                                </span>

                                                <span className={styles.selectedAddressCellValue}>
                                                    {renderAddressValue(
                                                        viewModel.selectedAddress.house,
                                                        notAvailableLabel,
                                                    )}
                                                </span>
                                            </div>

                                            <div className={styles.selectedAddressCell}>
                                                <span className={styles.selectedAddressCellLabel}>
                                                    {t('site.form.address.building')}
                                                </span>

                                                <span className={styles.selectedAddressCellValue}>
                                                    {renderAddressValue(
                                                        viewModel.selectedAddress.building,
                                                        notAvailableLabel,
                                                    )}
                                                </span>
                                            </div>

                                            <div className={styles.selectedAddressCell}>
                                                <span className={styles.selectedAddressCellLabel}>
                                                    {t('site.form.address.postalCode')}
                                                </span>

                                                <span className={styles.selectedAddressCellValue}>
                                                    {renderAddressValue(
                                                        viewModel.selectedAddress.postalCode,
                                                        notAvailableLabel,
                                                    )}
                                                </span>
                                            </div>

                                            <div className={styles.selectedAddressCell}>
                                                <span className={styles.selectedAddressCellLabel}>
                                                    {t('site.form.address.okato')}
                                                </span>

                                                <span className={styles.selectedAddressCellValue}>
                                                    {renderAddressValue(
                                                        viewModel.selectedAddress.okato,
                                                        notAvailableLabel,
                                                    )}
                                                </span>
                                            </div>

                                            <div className={styles.selectedAddressCell}>
                                                <span className={styles.selectedAddressCellLabel}>
                                                    {t('site.form.address.oktmo')}
                                                </span>

                                                <span className={styles.selectedAddressCellValue}>
                                                    {renderAddressValue(
                                                        viewModel.selectedAddress.oktmo,
                                                        notAvailableLabel,
                                                    )}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        </Card>
                    </div>

                    <Card
                        variant="default"
                        padding="md"
                        header={(
                            <div className={styles.sectionHeader}>
                                <Heading level={3}>
                                    {t('site.form.sections.contact.title')}
                                </Heading>

                                <Text variant="muted">
                                    {t('site.form.sections.contact.subtitle')}
                                </Text>
                            </div>
                        )}
                    >
                        <div className={styles.contactGrid}>
                            <label className={styles.field}>
                                <Text
                                    variant="caption"
                                    className={styles.fieldLabel}
                                >
                                    {t('site.form.fields.contactName')}
                                </Text>

                                <input
                                    className={[
                                        styles.control,
                                        viewModel.errors.contactName
                                            ? styles.controlError
                                            : '',
                                    ].filter(Boolean).join(' ')}
                                    placeholder={t('site.form.placeholders.contactName')}
                                    value={viewModel.values.contactName}
                                    autoComplete="name"
                                    {...buildTextInputHandler(
                                        'contactName',
                                        viewModel.setFieldValue,
                                        viewModel.markFieldTouched,
                                    )}
                                />

                                {viewModel.errors.contactName ? (
                                    <Text className={styles.fieldError}>
                                        {viewModel.errors.contactName}
                                    </Text>
                                ) : null}
                            </label>

                            <label className={styles.field}>
                                <Text
                                    variant="caption"
                                    className={styles.fieldLabel}
                                >
                                    {t('site.form.fields.contactPosition')}
                                </Text>

                                <input
                                    className={styles.control}
                                    placeholder={t('site.form.placeholders.contactPosition')}
                                    value={viewModel.values.contactPosition}
                                    autoComplete="organization-title"
                                    {...buildTextInputHandler(
                                        'contactPosition',
                                        viewModel.setFieldValue,
                                        viewModel.markFieldTouched,
                                    )}
                                />
                            </label>

                            <label className={styles.field}>
                                <Text
                                    variant="caption"
                                    className={styles.fieldLabel}
                                >
                                    {t('site.form.fields.contactEmail')}
                                </Text>

                                <input
                                    className={[
                                        styles.control,
                                        viewModel.errors.contactEmail
                                            ? styles.controlError
                                            : '',
                                    ].filter(Boolean).join(' ')}
                                    placeholder={t('site.form.placeholders.contactEmail')}
                                    value={viewModel.values.contactEmail}
                                    autoComplete="email"
                                    {...buildTextInputHandler(
                                        'contactEmail',
                                        viewModel.setFieldValue,
                                        viewModel.markFieldTouched,
                                    )}
                                />

                                {viewModel.errors.contactEmail ? (
                                    <Text className={styles.fieldError}>
                                        {viewModel.errors.contactEmail}
                                    </Text>
                                ) : null}
                            </label>

                            <label className={styles.field}>
                                <Text
                                    variant="caption"
                                    className={styles.fieldLabel}
                                >
                                    {t('site.form.fields.contactPhone')}
                                </Text>

                                <input
                                    type="tel"
                                    inputMode="tel"
                                    className={[
                                        styles.control,
                                        viewModel.errors.contactPhone
                                            ? styles.controlError
                                            : '',
                                    ].filter(Boolean).join(' ')}
                                    placeholder={t('site.form.placeholders.contactPhone')}
                                    value={viewModel.values.contactPhone}
                                    autoComplete="tel"
                                    {...buildTextInputHandler(
                                        'contactPhone',
                                        viewModel.setFieldValue,
                                        viewModel.markFieldTouched,
                                    )}
                                />

                                {viewModel.errors.contactPhone ? (
                                    <Text className={styles.fieldError}>
                                        {viewModel.errors.contactPhone}
                                    </Text>
                                ) : null}
                            </label>
                        </div>

                        {viewModel.saveError ? (
                            <div className={styles.saveErrorBlock}>
                                <Text className={styles.saveErrorText}>
                                    {viewModel.saveError}
                                </Text>
                            </div>
                        ) : null}

                        <div className={styles.footerBar}>
                            <div className={styles.footerActions}>
                                <Button
                                    type="submit"
                                    variant="primary"
                                    size="sm"
                                    disabled={!viewModel.isValid || viewModel.isSaving}
                                >
                                    {viewModel.isSaving
                                        ? t('site.form.actions.saving')
                                        : viewModel.primaryActionLabel}
                                </Button>

                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={!viewModel.isDirty || viewModel.isSaving}
                                    onClick={viewModel.reset}
                                >
                                    {viewModel.secondaryActionLabel}
                                </Button>

                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={viewModel.cancel}
                                >
                                    {viewModel.cancelActionLabel}
                                </Button>
                            </div>
                        </div>
                    </Card>
                </Stack>
            </form>
        </div>
    );
}