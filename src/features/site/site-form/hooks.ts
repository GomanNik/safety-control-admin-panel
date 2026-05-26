// =====================
// File: src/features/site/site-form/hooks.ts
// Purpose:
// - Unified create/edit site form model
// - Single source of truth for site form flow
// - Address is selected only from official registry
// =====================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  useSiteCreateMutation,
  useSitePatchMutation,
  useSiteQuery,
  type Site,
  type SiteApiError,
} from "../../../entities/site";

import type {
  SiteFormMode,
  SiteFormModel,
  SiteFormSubmitResult,
  SiteFormValues,
} from "./types";

import {
  areSiteFormValuesEqual,
  buildSiteFormPatchFromValues,
  createEmptySiteFormValues,
  hasSiteFormPatchChanges,
  mapSiteFormValuesToCreatePayload,
  mapSiteToSiteFormValues,
} from "./mappers";

import { validateSiteForm } from "./validation";

export interface UseSiteFormModelOptions {
  mode: SiteFormMode;
  siteId?: Site["id"] | null;
}

const getSiteUpdatedAtMs = (site: Site | null | undefined): number | null => {
  if (!site) {
    return null;
  }

  const timestamp = site.updatedAt?.getTime?.();

  return Number.isFinite(timestamp) ? timestamp : null;
};

export function useSiteFormModel(
  options: UseSiteFormModelOptions,
): SiteFormModel {
  const { mode } = options;
  const siteId = options.siteId ?? null;

  const emptyValues = useMemo(() => createEmptySiteFormValues(), []);

  const siteQuery = useSiteQuery(siteId, {
    enabled: mode === "edit" && siteId != null,
  });

  const createMutation = useSiteCreateMutation();
  const patchMutation = useSitePatchMutation();

  const resetCreateMutation = createMutation.reset;
  const resetPatchMutation = patchMutation.reset;

  const [values, setValues] = useState<SiteFormValues>(emptyValues);
  const [localError, setLocalError] = useState<SiteApiError | null>(null);

  const baselineRef = useRef<SiteFormValues>(emptyValues);
  const initializedSiteIdRef = useRef<Site["id"] | null>(null);
  const syncedSiteUpdatedAtMsRef = useRef<number | null>(null);
  const createModeInitializedRef = useRef(false);

  const syncFromSite = useCallback((site: Site): void => {
    const nextValues = mapSiteToSiteFormValues(site);

    baselineRef.current = nextValues;
    initializedSiteIdRef.current = site.id;
    syncedSiteUpdatedAtMsRef.current = getSiteUpdatedAtMs(site);

    setValues((prev) =>
      areSiteFormValuesEqual(prev, nextValues) ? prev : nextValues,
    );
  }, []);

  useEffect(() => {
    if (mode !== "create") {
      createModeInitializedRef.current = false;
      return;
    }

    if (createModeInitializedRef.current) {
      return;
    }

    createModeInitializedRef.current = true;

    baselineRef.current = emptyValues;
    initializedSiteIdRef.current = null;
    syncedSiteUpdatedAtMsRef.current = null;
    setValues(emptyValues);
    setLocalError(null);
    resetCreateMutation();
    resetPatchMutation();
  }, [emptyValues, mode, resetCreateMutation, resetPatchMutation]);

  const isDirty = useMemo(
    () => !areSiteFormValuesEqual(values, baselineRef.current),
    [values],
  );

  useEffect(() => {
    if (mode !== "edit") {
      return;
    }

    if (!siteId) {
      baselineRef.current = emptyValues;
      initializedSiteIdRef.current = null;
      syncedSiteUpdatedAtMsRef.current = null;
      setValues(emptyValues);
      setLocalError(null);
      resetPatchMutation();
      return;
    }

    const site = siteQuery.data;

    if (!site || site.id !== siteId) {
      return;
    }

    const isAnotherSite = initializedSiteIdRef.current !== site.id;

    const currentUpdatedAtMs = getSiteUpdatedAtMs(site);
    const hasFreshSiteVersion =
      currentUpdatedAtMs !== syncedSiteUpdatedAtMsRef.current;

    if (isAnotherSite || (!isDirty && hasFreshSiteVersion)) {
      syncFromSite(site);
      setLocalError(null);
      resetPatchMutation();
    }
  }, [
    emptyValues,
    isDirty,
    mode,
    resetPatchMutation,
    siteId,
    siteQuery.data,
    syncFromSite,
  ]);

  const validation = useMemo(
    () =>
      validateSiteForm(values, {
        mode,
        originalSite: siteQuery.data ?? null,
      }),
    [mode, siteQuery.data, values],
  );

  const setFieldValue = useCallback(
    <Name extends keyof SiteFormValues>(
      name: Name,
      value: SiteFormValues[Name],
    ): void => {
      setValues((prev) => {
        const next: SiteFormValues = {
          ...prev,
          [name]: value,
        };

        return areSiteFormValuesEqual(prev, next) ? prev : next;
      });

      if (localError) {
        setLocalError(null);
      }

      if (createMutation.error) {
        resetCreateMutation();
      }

      if (patchMutation.error) {
        resetPatchMutation();
      }
    },
    [
      createMutation.error,
      localError,
      patchMutation.error,
      resetCreateMutation,
      resetPatchMutation,
    ],
  );

  const reset = useCallback((): void => {
    setLocalError(null);

    if (createMutation.error) {
      resetCreateMutation();
    }

    if (patchMutation.error) {
      resetPatchMutation();
    }

    setValues(baselineRef.current);
  }, [
    createMutation.error,
    patchMutation.error,
    resetCreateMutation,
    resetPatchMutation,
  ]);

  const submit = useCallback(async (): Promise<SiteFormSubmitResult | null> => {
    setLocalError(null);

    const checked = validateSiteForm(values, {
      mode,
      originalSite: siteQuery.data ?? null,
    });

    if (!checked.isValid) {
      return null;
    }

    if (mode === "create") {
      try {
        const payload = mapSiteFormValuesToCreatePayload(checked.values);

        const site = await createMutation.mutateAsync({ payload });

        syncFromSite(site);

        return {
          site,
          mode,
          payload,
        };
      } catch (error) {
        setLocalError(error as SiteApiError);
        return null;
      }
    }

    const site = siteQuery.data;

    if (!site || !siteId) {
      return null;
    }

    const patch = buildSiteFormPatchFromValues(site, checked.values);

    if (!hasSiteFormPatchChanges(patch)) {
      return {
        site,
        mode,
        payload: patch,
      };
    }

    try {
      const savedSite = await patchMutation.mutateAsync({
        siteId,
        patch,
      });

      syncFromSite(savedSite);

      return {
        site: savedSite,
        mode,
        payload: patch,
      };
    } catch (error) {
      setLocalError(error as SiteApiError);
      return null;
    }
  }, [
    createMutation,
    mode,
    patchMutation,
    siteId,
    siteQuery.data,
    syncFromSite,
    values,
  ]);

  return {
    mode,
    site: siteQuery.data ?? null,
    loading: Boolean(
      mode === "edit" &&
      !siteQuery.data &&
      (siteQuery.isLoading || siteQuery.isFetching),
    ),
    error: siteQuery.error ?? null,
    values,
    errors: validation.errors,
    isDirty:
      mode === "create"
        ? !areSiteFormValuesEqual(values, emptyValues)
        : isDirty,
    isValid: validation.isValid,
    saving: Boolean(createMutation.isPending || patchMutation.isPending),
    saveError:
      localError ?? createMutation.error ?? patchMutation.error ?? null,
    setFieldValue,
    reset,
    submit,
  };
}
