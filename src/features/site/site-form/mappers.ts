// =====================
// File: src/features/site/site-form/mappers.ts
// Purpose:
// - Internal mapping helpers for unified site form
// - Address is selected only from official registry
// - Registry metadata is stored in site.config.addressRegistry
// - Site code is normalized and generated as a short operational code
// =====================

import type {
    Site,
    SiteAddress,
    SiteContact,
    SiteCreate,
    SitePatch,
} from '../../../entities/site';

import type {
    SiteFormAddressSelection,
    SiteFormValues,
} from './types';

const FIXED_COUNTRY = 'Россия';
const ADDRESS_REGISTRY_CONFIG_KEY = 'addressRegistry';
const SITE_CODE_MAX_LENGTH = 24;
const SITE_CODE_ALPHA_SEGMENT_LIMITS = [4, 3] as const;
const SITE_CODE_NUMERIC_SEGMENT_MIN_LENGTH = 2;

const CYRILLIC_TO_LATIN_MAP: Readonly<Record<string, string>> = {
    '\u0430': 'a',
    '\u0431': 'b',
    '\u0432': 'v',
    '\u0433': 'g',
    '\u0434': 'd',
    '\u0435': 'e',
    '\u0451': 'e',
    '\u0436': 'zh',
    '\u0437': 'z',
    '\u0438': 'i',
    '\u0439': 'y',
    '\u043A': 'k',
    '\u043B': 'l',
    '\u043C': 'm',
    '\u043D': 'n',
    '\u043E': 'o',
    '\u043F': 'p',
    '\u0440': 'r',
    '\u0441': 's',
    '\u0442': 't',
    '\u0443': 'u',
    '\u0444': 'f',
    '\u0445': 'h',
    '\u0446': 'ts',
    '\u0447': 'ch',
    '\u0448': 'sh',
    '\u0449': 'sch',
    '\u044A': '',
    '\u044B': 'y',
    '\u044C': '',
    '\u044D': 'e',
    '\u044E': 'yu',
    '\u044F': 'ya',
};

const SITE_CODE_STOP_WORDS = new Set<string>([
    'ploshadka',
    'ploschadka',
    'site',
    'object',
    'obekt',
    'objekt',
    'zdanie',
    'building',
    'main',
    'osnovnaya',
    'osnovnoe',
    'osnovnoy',
    'glavnaya',
    'glavnoe',
    'glavniy',
]);

const normalizeText = (
    value: unknown,
): string => String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();

const transliterateToLatin = (
    value: string,
): string => {
    let result = '';

    for (const char of value) {
        const lower = char.toLowerCase();
        const mapped = CYRILLIC_TO_LATIN_MAP[lower];

        if (mapped !== undefined) {
            result += mapped;
            continue;
        }

        result += lower;
    }

    return result;
};

const normalizeCode = (
    value: unknown,
): string => {
    const normalized = transliterateToLatin(
        normalizeText(value),
    )
        .toUpperCase()
        .replace(/[^A-Z0-9_-]+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^[-_]+|[-_]+$/g, '');

    return normalized.slice(0, SITE_CODE_MAX_LENGTH);
};

const normalizeEmail = (
    value: unknown,
): string => normalizeText(value).toLowerCase();

const normalizeOptionalText = (
    value: unknown,
): string | undefined => {
    const normalized = normalizeText(value);
    return normalized || undefined;
};

const normalizeNullableText = (
    value: unknown,
): string | null | undefined => {
    if (value === undefined) {
        return undefined;
    }

    if (value === null) {
        return null;
    }

    const normalized = normalizeText(value);
    return normalized || null;
};

const serializeComparable = (
    value: unknown,
): string => {
    try {
        return JSON.stringify(value ?? null);
    } catch {
        return 'null';
    }
};

const isNumericToken = (
    value: string,
): boolean => /^\d+$/.test(value);

const tokenizeSiteCodeSource = (
    value: string,
): string[] => transliterateToLatin(normalizeText(value))
    .replace(/[^a-z0-9]+/gi, ' ')
    .split(/\s+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

const buildUniqueList = (
    values: readonly string[],
): string[] => {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const value of values) {
        if (!value || seen.has(value)) {
            continue;
        }

        seen.add(value);
        result.push(value);
    }

    return result;
};

const buildAlphaCodeSegment = (
    token: string,
    index: number,
): string => {
    const normalized = token
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '');

    if (!normalized) {
        return '';
    }

    const limit = SITE_CODE_ALPHA_SEGMENT_LIMITS[
        Math.min(index, SITE_CODE_ALPHA_SEGMENT_LIMITS.length - 1)
        ];

    return normalized.slice(0, limit);
};

const buildNumericCodeSegment = (
    token: string,
): string => {
    const normalized = token.replace(/\D+/g, '');

    if (!normalized) {
        return '';
    }

    if (normalized.length >= SITE_CODE_NUMERIC_SEGMENT_MIN_LENGTH) {
        return normalized;
    }

    return normalized.padStart(
        SITE_CODE_NUMERIC_SEGMENT_MIN_LENGTH,
        '0',
    );
};

const buildShortCodeParts = (
    name: string,
): string[] => {
    const rawTokens = tokenizeSiteCodeSource(name);

    if (rawTokens.length === 0) {
        return [];
    }

    const alphaTokens = buildUniqueList(
        rawTokens.filter((token) => (
            !isNumericToken(token) &&
            !SITE_CODE_STOP_WORDS.has(token)
        )),
    );

    const fallbackAlphaTokens = buildUniqueList(
        rawTokens.filter((token) => !isNumericToken(token)),
    );

    const numericTokens = buildUniqueList(
        rawTokens.filter(isNumericToken),
    );

    const sourceAlphaTokens = alphaTokens.length > 0
        ? alphaTokens
        : fallbackAlphaTokens;

    const parts: string[] = [];

    sourceAlphaTokens
        .slice(0, SITE_CODE_ALPHA_SEGMENT_LIMITS.length)
        .forEach((token, index) => {
            const segment = buildAlphaCodeSegment(token, index);

            if (segment) {
                parts.push(segment);
            }
        });

    if (numericTokens.length > 0) {
        const numericSegment = buildNumericCodeSegment(numericTokens[0]);

        if (numericSegment) {
            parts.push(numericSegment);
        }
    }

    return parts;
};

function normalizeAddressSelection(
    value: SiteFormAddressSelection | null | undefined,
): SiteFormAddressSelection | null {
    if (!value) {
        return null;
    }

    const registryId = normalizeText(value.registryId);
    const label = normalizeText(value.label);

    if (!registryId || !label) {
        return null;
    }

    return {
        source: 'gar_fias',
        registryId,
        label,
        shortLabel: normalizeOptionalText(value.shortLabel),
        objectGuid: normalizeOptionalText(value.objectGuid),
        objectId: normalizeOptionalText(value.objectId),
        houseGuid: normalizeOptionalText(value.houseGuid),
        houseId: normalizeOptionalText(value.houseId),
        region: normalizeOptionalText(value.region),
        city: normalizeOptionalText(value.city),
        settlement: normalizeOptionalText(value.settlement),
        street: normalizeOptionalText(value.street),
        house: normalizeOptionalText(value.house),
        building: normalizeOptionalText(value.building),
        postalCode: normalizeOptionalText(value.postalCode),
        okato: normalizeOptionalText(value.okato),
        oktmo: normalizeOptionalText(value.oktmo),
    };
}

function buildAddressLine1FromSelection(
    selection: SiteFormAddressSelection,
): string | undefined {
    const parts: string[] = [];

    if (selection.street) {
        parts.push(selection.street);
    }

    if (selection.house) {
        parts.push(`д. ${selection.house}`);
    }

    if (selection.building) {
        parts.push(`корп. ${selection.building}`);
    }

    return parts.length > 0
        ? parts.join(', ')
        : undefined;
}

function buildAddressFromSelection(
    selection: SiteFormAddressSelection,
): SiteAddress {
    return {
        country: FIXED_COUNTRY,
        region: selection.region || undefined,
        city: selection.city || selection.settlement || undefined,
        addressLine1: buildAddressLine1FromSelection(selection),
        postalCode: selection.postalCode || undefined,
    };
}

function buildAddressDisplay(
    params: {
        region?: string | null;
        city?: string | null;
        settlement?: string | null;
        addressLine1?: string | null;
        postalCode?: string | null;
    },
): string {
    const parts = [
        normalizeText(params.region),
        normalizeText(params.city ?? params.settlement),
        normalizeText(params.addressLine1),
        normalizeText(params.postalCode),
    ].filter(Boolean);

    return parts.join(', ');
}

function getSiteConfigRecord(
    site: Site | null | undefined,
): Record<string, unknown> | null {
    const config = site?.config;

    if (!config || typeof config !== 'object') {
        return null;
    }

    return config as Record<string, unknown>;
}

function readSiteAddressRegistryRaw(
    site: Site | null | undefined,
): Record<string, unknown> | null {
    const config = getSiteConfigRecord(site);

    if (!config) {
        return null;
    }

    const raw = config[ADDRESS_REGISTRY_CONFIG_KEY];

    if (!raw || typeof raw !== 'object') {
        return null;
    }

    return raw as Record<string, unknown>;
}

function mapRawRegistryToSelection(
    raw: Record<string, unknown> | null,
): SiteFormAddressSelection | null {
    if (!raw) {
        return null;
    }

    return normalizeAddressSelection({
        source: 'gar_fias',
        registryId: normalizeText(
            raw.registryId ??
            raw.registry_id ??
            raw.id,
        ),
        label: normalizeText(
            raw.label ??
            raw.fullLabel ??
            raw.full_label,
        ),
        shortLabel: normalizeOptionalText(
            raw.shortLabel ?? raw.short_label,
        ),
        objectGuid: normalizeOptionalText(
            raw.objectGuid ?? raw.object_guid,
        ),
        objectId: normalizeOptionalText(
            raw.objectId ?? raw.object_id,
        ),
        houseGuid: normalizeOptionalText(
            raw.houseGuid ?? raw.house_guid,
        ),
        houseId: normalizeOptionalText(
            raw.houseId ?? raw.house_id,
        ),
        region: normalizeOptionalText(raw.region),
        city: normalizeOptionalText(raw.city),
        settlement: normalizeOptionalText(raw.settlement),
        street: normalizeOptionalText(raw.street),
        house: normalizeOptionalText(raw.house),
        building: normalizeOptionalText(raw.building),
        postalCode: normalizeOptionalText(
            raw.postalCode ?? raw.postal_code,
        ),
        okato: normalizeOptionalText(raw.okato),
        oktmo: normalizeOptionalText(raw.oktmo),
    });
}

function buildStoredAddressRegistryMeta(
    selection: SiteFormAddressSelection,
): Record<string, unknown> {
    return {
        source: 'gar_fias',
        registryId: selection.registryId,
        label: selection.label,
        shortLabel: selection.shortLabel,
        objectGuid: selection.objectGuid,
        objectId: selection.objectId,
        houseGuid: selection.houseGuid,
        houseId: selection.houseId,
        region: selection.region,
        city: selection.city,
        settlement: selection.settlement,
        street: selection.street,
        house: selection.house,
        building: selection.building,
        postalCode: selection.postalCode,
        okato: selection.okato,
        oktmo: selection.oktmo,
    };
}

function mergeSiteConfigWithAddressRegistry(
    originalConfig: Site['config'] | undefined,
    selection: SiteFormAddressSelection,
): Record<string, unknown> {
    return {
        ...(originalConfig ?? {}),
        [ADDRESS_REGISTRY_CONFIG_KEY]: buildStoredAddressRegistryMeta(selection),
    };
}

function buildContactFromValues(
    values: SiteFormValues,
): SiteContact | undefined {
    const hasContact =
        values.contactName ||
        values.contactEmail ||
        values.contactPhone ||
        values.contactPosition;

    if (!hasContact) {
        return undefined;
    }

    return {
        name: values.contactName,
        email: values.contactEmail || undefined,
        phone: values.contactPhone || undefined,
        position: values.contactPosition || undefined,
    };
}

function normalizeSiteAddressComparable(
    value: SiteAddress | null | undefined,
): SiteAddress | null {
    if (!value) {
        return null;
    }

    return {
        country: normalizeText(value.country) || FIXED_COUNTRY,
        region: normalizeOptionalText(value.region),
        city: normalizeOptionalText(value.city),
        addressLine1: normalizeOptionalText(value.addressLine1),
        addressLine2: normalizeOptionalText(value.addressLine2),
        postalCode: normalizeOptionalText(value.postalCode),
        latitude: typeof value.latitude === 'number'
            ? value.latitude
            : undefined,
        longitude: typeof value.longitude === 'number'
            ? value.longitude
            : undefined,
    };
}

export const generateSiteCodeFromName = (
    name: string,
): string => {
    const normalizedName = normalizeText(name);

    if (!normalizedName) {
        return '';
    }

    const parts = buildShortCodeParts(normalizedName);

    if (parts.length === 0) {
        return '';
    }

    return normalizeCode(parts.join('-'));
};

export const createEmptySiteFormValues = (): SiteFormValues => ({
    name: '',
    code: '',
    addressQuery: '',
    addressSelection: null,
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    contactPosition: '',
});

export const normalizeSiteFormValues = (
    values: SiteFormValues,
): SiteFormValues => ({
    name: normalizeText(values.name),
    code: normalizeCode(values.code),
    addressQuery: normalizeText(values.addressQuery),
    addressSelection: normalizeAddressSelection(values.addressSelection),
    contactName: normalizeText(values.contactName),
    contactEmail: normalizeEmail(values.contactEmail),
    contactPhone: normalizeText(values.contactPhone),
    contactPosition: normalizeText(values.contactPosition),
});

export const readSiteAddressRegistrySelection = (
    site: Site | null | undefined,
): SiteFormAddressSelection | null => (
    mapRawRegistryToSelection(
        readSiteAddressRegistryRaw(site),
    )
);

export const hasSiteOfficialAddressBinding = (
    site: Site | null | undefined,
): boolean => Boolean(
    readSiteAddressRegistrySelection(site),
);

export const formatSiteAddressForDisplay = (
    site: Site | null | undefined,
): string => {
    if (!site) {
        return '';
    }

    const selection = readSiteAddressRegistrySelection(site);

    if (selection?.label) {
        return selection.label;
    }

    return buildAddressDisplay({
        region: site.region ?? site.address?.region,
        city: site.address?.city,
        addressLine1: site.address?.addressLine1,
        postalCode: site.address?.postalCode,
    });
};

export const getSiteFormInitialAddressQuery = (
    site: Site | null | undefined,
): string => formatSiteAddressForDisplay(site);

export const siteNeedsAddressRegistryBinding = (
    site: Site | null | undefined,
): boolean => {
    if (!site) {
        return false;
    }

    return Boolean(
        formatSiteAddressForDisplay(site) &&
        !hasSiteOfficialAddressBinding(site),
    );
};

export const mapSiteToSiteFormValues = (
    site: Site,
): SiteFormValues => {
    const selection = readSiteAddressRegistrySelection(site);

    return {
        name: normalizeText(site.name),
        code: normalizeCode(site.code),
        addressQuery: selection?.label ?? formatSiteAddressForDisplay(site),
        addressSelection: selection,
        contactName: normalizeText(site.contact?.name),
        contactEmail: normalizeEmail(site.contact?.email),
        contactPhone: normalizeText(site.contact?.phone),
        contactPosition: normalizeText(site.contact?.position),
    };
};

export const mapSiteFormValuesToCreatePayload = (
    input: SiteFormValues,
): SiteCreate => {
    const values = normalizeSiteFormValues(input);
    const selection = values.addressSelection;

    return {
        name: values.name,
        code: values.code || null,
        region: selection?.region || null,
        address: selection
            ? buildAddressFromSelection(selection)
            : undefined,
        contact: buildContactFromValues(values),
        config: selection
            ? mergeSiteConfigWithAddressRegistry(undefined, selection)
            : undefined,
    };
};

export const buildSiteFormPatchFromValues = (
    original: Site,
    input: SiteFormValues,
): SitePatch => {
    const previous = normalizeSiteFormValues(
        mapSiteToSiteFormValues(original),
    );
    const current = normalizeSiteFormValues(input);

    const patch: SitePatch = {};

    if (current.name !== previous.name) {
        patch.name = current.name;
    }

    if (current.code !== previous.code) {
        patch.code = current.code || null;
    }

    const currentContact = buildContactFromValues(current);
    const previousContact = buildContactFromValues(previous);

    if (
        serializeComparable(currentContact) !==
        serializeComparable(previousContact)
    ) {
        patch.contact = currentContact ?? null;
    }

    const currentSelection = current.addressSelection;
    const previousSelection = previous.addressSelection;

    if (currentSelection) {
        const nextAddress = buildAddressFromSelection(currentSelection);
        const prevAddress = normalizeSiteAddressComparable(original.address);

        if (
            serializeComparable(nextAddress) !==
            serializeComparable(prevAddress)
        ) {
            patch.address = nextAddress;
        }

        const nextRegion = currentSelection.region || null;
        const prevRegion = normalizeNullableText(
            original.region ?? original.address?.region,
        );

        if (nextRegion !== prevRegion) {
            patch.region = nextRegion;
        }

        const nextRegistryMeta = buildStoredAddressRegistryMeta(
            currentSelection,
        );
        const prevRegistryMeta = previousSelection
            ? buildStoredAddressRegistryMeta(previousSelection)
            : null;

        if (
            serializeComparable(nextRegistryMeta) !==
            serializeComparable(prevRegistryMeta)
        ) {
            patch.config = mergeSiteConfigWithAddressRegistry(
                original.config,
                currentSelection,
            );
        }
    }

    return patch;
};

export const hasSiteFormPatchChanges = (
    patch: SitePatch,
): boolean => Object.keys(patch).some((key) => (
    patch[key as keyof SitePatch] !== undefined
));

export const areSiteFormValuesEqual = (
    left: SiteFormValues,
    right: SiteFormValues,
): boolean => (
    serializeComparable(normalizeSiteFormValues(left)) ===
    serializeComparable(normalizeSiteFormValues(right))
);