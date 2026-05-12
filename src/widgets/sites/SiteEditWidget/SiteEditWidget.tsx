// =====================
// File: src/widgets/sites/SiteEditWidget/SiteEditWidget.tsx
// Purpose:
// - Composite edit widget for site page
// - Reuses the shared site cameras setup section
// - Keeps site edit and camera management in one consistent screen
// - Improves layout rhythm and visual grouping
// =====================

import type { JSX } from "react";

import { Stack } from "../../../shared/ui";

import { SiteFormWidget } from "../SiteFormWidget";
import { SiteCamerasSetupSection } from "../_shared/SiteCamerasSetupSection";

import type { SiteEditWidgetProps } from "./types";
import styles from "./ui/SiteEditWidget.module.css";

export function SiteEditWidget(
    props: SiteEditWidgetProps,
): JSX.Element {
    const { className, siteId, onSaved, onCancel, ...rest } = props;

    return (
        <div
            className={[styles.root, className ?? ""].filter(Boolean).join(" ")}
            {...rest}
        >
            <Stack gap={16}>
                <SiteFormWidget
                    mode="edit"
                    siteId={siteId}
                    onSaved={onSaved}
                    onCancel={onCancel}
                />

                <SiteCamerasSetupSection
                    siteId={siteId}
                    translationPrefix="site.edit.cameras"
                />
            </Stack>
        </div>
    );
}