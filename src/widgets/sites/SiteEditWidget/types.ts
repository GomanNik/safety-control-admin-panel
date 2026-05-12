// =====================
// File: src/widgets/sites/SiteEditWidget/types.ts
// Purpose:
// - Public contracts for composite SiteEditWidget
// - Combines site edit form with inline camera management
// =====================

import type { HTMLAttributes } from "react";

import type { Site } from "../../../entities/site";

export interface SiteEditWidgetProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "children"
> {
  siteId?: Site["id"] | null;
  onSaved?: (site: Site) => void;
  onCancel?: () => void;
}
