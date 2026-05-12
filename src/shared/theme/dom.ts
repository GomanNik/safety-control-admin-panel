// =====================
// shared/theme/dom.ts
// =====================

import type {
    ResolvedThemeMode,
    ThemeDefinition,
    ThemeMode,
    ThemeName,
    ThemeTokens,
} from './types';

export interface ApplyThemeToDocumentOptions {
    /**
     * Элемент, к которому применять тему.
     * По умолчанию: document.documentElement.
     */
    rootElement?: HTMLElement | null;

    /**
     * Имя темы для data-theme.
     * По умолчанию: theme.name.
     */
    themeName?: ThemeName;

    /**
     * Запрошенный режим темы.
     * По умолчанию: light.
     */
    mode?: ThemeMode;

    /**
     * Выставлять ли data-theme / data-theme-mode /
     * data-theme-resolved-mode.
     * По умолчанию: true.
     */
    setDataAttributes?: boolean;

    /**
     * Выставлять ли theme-light / theme-dark на root.
     * По умолчанию: true.
     */
    setClassName?: boolean;
}

const canUseDom = (): boolean => {
    return typeof window !== 'undefined' && typeof document !== 'undefined';
};

const resolveRootElement = (
    rootElement?: HTMLElement | null,
): HTMLElement | null => {
    if (!canUseDom()) {
        return null;
    }

    return rootElement ?? document.documentElement ?? null;
};

const resolveMode = (mode: ThemeMode): ResolvedThemeMode => {
    if (mode === 'light' || mode === 'dark') {
        return mode;
    }

    const prefersDark =
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches;

    return prefersDark ? 'dark' : 'light';
};

const setThemeColorVariables = (
    style: CSSStyleDeclaration,
    tokens: ThemeTokens,
): void => {
    style.setProperty('--color-primary', tokens.colors.primary);
    style.setProperty('--color-primary-soft', tokens.colors.primarySoft);
    style.setProperty('--color-primary-strong', tokens.colors.primaryStrong);

    style.setProperty('--color-info', tokens.colors.info);
    style.setProperty('--color-muted', tokens.colors.muted);

    style.setProperty('--color-danger', tokens.colors.danger);
    style.setProperty('--color-warning', tokens.colors.warning);
    style.setProperty('--color-success', tokens.colors.success);

    style.setProperty('--color-text-primary', tokens.colors.textPrimary);
    style.setProperty('--color-text-secondary', tokens.colors.textSecondary);
    style.setProperty('--color-text-muted', tokens.colors.textMuted);

    style.setProperty('--color-bg-primary', tokens.colors.bgPrimary);
    style.setProperty('--color-bg-secondary', tokens.colors.bgSecondary);
    style.setProperty('--color-bg-elevated', tokens.colors.bgElevated);

    style.setProperty('--color-border-subtle', tokens.colors.borderSubtle);

    style.setProperty('--color-border', tokens.colors.borderSubtle);
    style.setProperty(
        '--color-border-strong',
        `color-mix(in srgb, ${tokens.colors.borderSubtle} 65%, ${tokens.colors.textPrimary})`,
    );

    style.setProperty('--color-focus-ring', tokens.colors.primarySoft);
    style.setProperty(
        '--color-focus-ring-strong',
        `color-mix(in srgb, ${tokens.colors.primary} 42%, transparent)`,
    );
};

const setThemeTypographyVariables = (
    style: CSSStyleDeclaration,
    tokens: ThemeTokens,
): void => {
    style.setProperty('--font-family-main', tokens.typography.fontFamily);

    style.setProperty('--font-size-xs', tokens.typography.fontSizeXs);
    style.setProperty('--font-size-sm', tokens.typography.fontSizeSm);
    style.setProperty('--font-size-md', tokens.typography.fontSizeMd);
    style.setProperty('--font-size-lg', tokens.typography.fontSizeLg);
    style.setProperty('--font-size-xl', tokens.typography.fontSizeXl);

    style.setProperty(
        '--line-height-tight',
        String(tokens.typography.lineHeightTight),
    );
    style.setProperty(
        '--line-height-normal',
        String(tokens.typography.lineHeightNormal),
    );
    style.setProperty(
        '--line-height-relaxed',
        String(tokens.typography.lineHeightRelaxed),
    );

    style.setProperty(
        '--font-weight-regular',
        String(tokens.typography.fontWeightRegular),
    );
    style.setProperty(
        '--font-weight-medium',
        String(tokens.typography.fontWeightMedium),
    );
    style.setProperty(
        '--font-weight-bold',
        String(tokens.typography.fontWeightBold),
    );
};

const setThemeSpacingVariables = (
    style: CSSStyleDeclaration,
    tokens: ThemeTokens,
): void => {
    style.setProperty('--space-none', `${tokens.spacing.none}px`);
    style.setProperty('--space-xs', `${tokens.spacing.xs}px`);
    style.setProperty('--space-sm', `${tokens.spacing.sm}px`);
    style.setProperty('--space-md', `${tokens.spacing.md}px`);
    style.setProperty('--space-lg', `${tokens.spacing.lg}px`);
    style.setProperty('--space-xl', `${tokens.spacing.xl}px`);
};

const setThemeRadiusVariables = (
    style: CSSStyleDeclaration,
    tokens: ThemeTokens,
): void => {
    style.setProperty('--radius-none', `${tokens.radius.none}px`);
    style.setProperty('--radius-sm', `${tokens.radius.sm}px`);
    style.setProperty('--radius-md', `${tokens.radius.md}px`);
    style.setProperty('--radius-lg', `${tokens.radius.lg}px`);
    style.setProperty('--radius-pill', `${tokens.radius.pill}px`);
    style.setProperty('--radius-full', `${tokens.radius.full}px`);
};

const setThemeShadowVariables = (
    style: CSSStyleDeclaration,
    tokens: ThemeTokens,
): void => {
    style.setProperty('--shadow-xs', tokens.shadows.xs);
    style.setProperty('--shadow-sm', tokens.shadows.sm);
    style.setProperty('--shadow-md', tokens.shadows.md);
    style.setProperty('--shadow-lg', tokens.shadows.lg);
};

const applyThemeCssVariables = (
    root: HTMLElement,
    tokens: ThemeTokens,
): void => {
    const style = root.style;

    setThemeColorVariables(style, tokens);
    setThemeTypographyVariables(style, tokens);
    setThemeSpacingVariables(style, tokens);
    setThemeRadiusVariables(style, tokens);
    setThemeShadowVariables(style, tokens);
};

/**
 * Единственная точка применения глобальной темы к DOM:
 * - выбирает tokens по resolved mode;
 * - записывает theme-level CSS variables;
 * - выставляет data-theme / data-theme-mode / data-theme-resolved-mode;
 * - выставляет root-класс theme-light / theme-dark.
 */
export const applyThemeToDocument = (
    theme: ThemeDefinition,
    options?: ApplyThemeToDocumentOptions,
): void => {
    const root = resolveRootElement(options?.rootElement);

    if (!root) {
        return;
    }

    const requestedMode = options?.mode ?? 'light';
    const resolvedMode = resolveMode(requestedMode);

    applyThemeCssVariables(root, theme.tokens[resolvedMode]);

    const effectiveThemeName = options?.themeName ?? theme.name;

    if (options?.setDataAttributes !== false) {
        root.setAttribute('data-theme', String(effectiveThemeName));
        root.setAttribute('data-theme-mode', String(requestedMode));
        root.setAttribute(
            'data-theme-resolved-mode',
            String(resolvedMode),
        );
    }

    if (options?.setClassName !== false) {
        try {
            root.classList.remove('theme-light', 'theme-dark');
            root.classList.add(`theme-${resolvedMode}`);
        } catch {
            // Ограниченное DOM-окружение не должно ломать применение theme vars.
        }
    }
};