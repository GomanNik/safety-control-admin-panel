// =====================
// File: src/widgets/sites/SiteCreateWidget/types.ts
// Purpose:
// - Public contracts for SiteCreateWidget
// - Site create flow now supports optional camera setup after site save
// =====================

import type { HTMLAttributes } from "react";

import type { Site } from "../../../entities/site";

export interface SiteCreateWidgetProps
    extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
    onSaved?: (site: Site) => void;
    onCancel?: () => void;
}