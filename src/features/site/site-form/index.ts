// =====================
// File: src/features/site/site-form/index.ts
// Purpose:
// - Public barrel for site-form feature
// - Exposes stable public contracts and widget-safe helpers
// =====================

export { useSiteFormModel } from "./hooks";
export type { UseSiteFormModelOptions } from "./hooks";

export {
  generateSiteCodeFromName,
  getSiteFormInitialAddressQuery,
  siteNeedsAddressRegistryBinding,
} from "./mappers";

export type {
  SiteFormAddressSelection,
  SiteFormMode,
  SiteFormModel,
  SiteFormSubmitResult,
  SiteFormValidationContext,
  SiteFormValidationErrorCode,
  SiteFormValidationErrorMap,
  SiteFormValidationResult,
  SiteFormValues,
} from "./types";
