// =====================
// File: src/entities/site/formatters.ts
// Purpose:
// - Site presentation helpers used by features/widgets
// - Subtitle falls back to normalized address and stored registry metadata
// =====================

import {
  t as sharedT,
  getCurrentLocale,
  type LocaleCode,
  type TFunction,
} from "../../shared/i18n";
import { getGlobalLogger } from "../../shared/logging";

import type { Site } from "./model";

const logger = getGlobalLogger()
  .child("entities")
  .child("site")
  .child("formatters");

const loggedMissingOptionsKeys = new Set<string>();

export interface SiteFormatterOptions {
  t?: TFunction;
  locale?: LocaleCode;
  emptyValue?: string;
}

function resolveT(options?: SiteFormatterOptions): TFunction {
  return options?.t ?? sharedT;
}

function resolveLocale(options?: SiteFormatterOptions): LocaleCode {
  return options?.locale ?? getCurrentLocale();
}

function warnMissingI18nOptions(
  formatterName: string,
  options?: SiteFormatterOptions,
): void {
  const missingT = typeof options?.t !== "function";
  const missingLocale = !options?.locale;

  if (!missingT && !missingLocale) {
    return;
  }

  const key = `${formatterName}|missingT:${String(missingT)}|missingLocale:${String(missingLocale)}`;

  if (loggedMissingOptionsKeys.has(key)) {
    return;
  }

  loggedMissingOptionsKeys.add(key);

  logger.warn(
    "site formatter called without explicit i18n options; using shared singleton fallback",
    {
      formatterName,
      missingT,
      missingLocale,
      resolvedLocale: resolveLocale(options),
      fallbackSource: "shared/i18n singleton",
    },
  );
}

function formatNotAvailable(options?: SiteFormatterOptions): string {
  const t = resolveT(options);

  return (
    options?.emptyValue ??
    t("common.notAvailable", {
      defaultValue: "—",
    })
  );
}

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function readAddressRegistryRecord(
  site: unknown,
): Record<string, unknown> | null {
  if (!site || typeof site !== "object") {
    return null;
  }

  const candidate = site as {
    config?: unknown;
  };

  if (!candidate.config || typeof candidate.config !== "object") {
    return null;
  }

  const config = candidate.config as Record<string, unknown>;
  const registry = config.addressRegistry;

  if (!registry || typeof registry !== "object") {
    return null;
  }

  return registry as Record<string, unknown>;
}

export function formatSiteDisplayName(
  site: Pick<Site, "name" | "code"> | unknown,
  options?: SiteFormatterOptions,
): string {
  warnMissingI18nOptions("formatSiteDisplayName", options);

  const empty = formatNotAvailable(options);

  if (!site || typeof site !== "object") {
    return empty;
  }

  const candidate = site as Record<string, unknown>;

  const name = normalizeText(candidate.name);
  const code = normalizeText(candidate.code);

  if (!name && !code) {
    return empty;
  }

  if (code && name) {
    return `${code} · ${name}`;
  }

  return code || name;
}

export function formatSiteDisplaySubtitle(
  site: Pick<Site, "region" | "address" | "config"> | unknown,
  options?: SiteFormatterOptions,
): string {
  warnMissingI18nOptions("formatSiteDisplaySubtitle", options);

  const empty = formatNotAvailable(options);

  if (!site || typeof site !== "object") {
    return empty;
  }

  const candidate = site as {
    region?: unknown;
    address?: {
      region?: unknown;
      city?: unknown;
    } | null;
    config?: unknown;
  };

  const registry = readAddressRegistryRecord(site);

  const city = normalizeText(
    candidate.address?.city ?? registry?.city ?? registry?.settlement,
  );

  const region = normalizeText(
    candidate.region ?? candidate.address?.region ?? registry?.region,
  );

  return city || region || empty;
}
