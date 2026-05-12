// =====================
// shared/theme/types.ts
// =====================

export type ThemeName = 'default' | (string & {});
export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedThemeMode = 'light' | 'dark';

/**
 * Единый семантический ключ цвета для UI/домена.
 * Это не raw-цвет, а смысловой слот.
 */
export type SemanticColorKey =
    | 'primary'
    | 'info'
    | 'success'
    | 'warning'
    | 'danger'
    | 'muted';

export interface ColorTokens {
    primary: string;
    primarySoft: string;
    primaryStrong: string;

    info: string;
    muted: string;

    danger: string;
    warning: string;
    success: string;

    textPrimary: string;
    textSecondary: string;
    textMuted: string;

    bgPrimary: string;
    bgSecondary: string;
    bgElevated: string;

    borderSubtle: string;
}

export interface TypographyTokens {
    fontFamily: string;

    fontSizeXs: string;
    fontSizeSm: string;
    fontSizeMd: string;
    fontSizeLg: string;
    fontSizeXl: string;

    lineHeightTight: number;
    lineHeightNormal: number;
    lineHeightRelaxed: number;

    fontWeightRegular: number;
    fontWeightMedium: number;
    fontWeightBold: number;
}

export interface SpacingTokens {
    none: number;
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
}

export interface RadiusTokens {
    none: number;
    sm: number;
    md: number;
    lg: number;
    pill: number;
    full: number;
}

export interface ShadowTokens {
    xs: string;
    sm: string;
    md: string;
    lg: string;
}

/**
 * Полный контракт токенов темы.
 * Структура намеренно жёсткая и вложенная:
 * colors / typography / spacing / radius / shadows.
 */
export interface ThemeTokens {
    colors: ColorTokens;
    typography: TypographyTokens;
    spacing: SpacingTokens;
    radius: RadiusTokens;
    shadows: ShadowTokens;
}

/**
 * ThemeDefinition = тема как самостоятельная ось.
 * mode сюда не входит.
 *
 * У каждой темы есть два набора токенов:
 * - light
 * - dark
 *
 * Это позволяет:
 * - выбирать тему независимо от режима;
 * - выбирать режим независимо от темы.
 */
export interface ThemeDefinition {
    name: ThemeName;
    tokens: Record<ResolvedThemeMode, ThemeTokens>;
}

export interface ThemeConfig {
    defaultTheme: ThemeName;
    defaultMode: ThemeMode;
    themes: ThemeDefinition[];
}

export interface ThemeContextValue {
    theme: ThemeDefinition;
    mode: ThemeMode;
    resolvedMode: ResolvedThemeMode;
    availableThemes: ThemeDefinition[];
    setTheme(name: ThemeName): void;
    setMode(mode: ThemeMode): void;
}