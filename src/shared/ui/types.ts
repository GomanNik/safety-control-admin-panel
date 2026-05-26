// =====================
// shared/ui/types.ts
// =====================

import type { ReactNode } from 'react';

/**
 * Минимальный внутренний набор общих типов для shared/ui.
 *
 * Намеренно не держим здесь SizeToken / VariantToken:
 * они не стали единым контрактом для всего UI-kit
 * и только создавали ложную "общность".
 */

export type AlignToken = 'start' | 'center' | 'end' | 'stretch';

export type JustifyToken = 'start' | 'center' | 'end' | 'between';

export interface WithChildren {
    children?: ReactNode;
}