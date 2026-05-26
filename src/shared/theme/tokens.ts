// =====================
// shared/theme/tokens.ts
// =====================

import type {
    ThemeDefinition,
    ThemeTokens,
    TypographyTokens,
    SpacingTokens,
    RadiusTokens,
    ShadowTokens,
} from './types';

const commonTypography: TypographyTokens = {
    fontFamily:
        'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", "Apple Color Emoji", "Segoe UI Emoji"',
    fontSizeXs: '12px',
    fontSizeSm: '13px',
    fontSizeMd: '15px',
    fontSizeLg: '18px',
    fontSizeXl: '22px',
    lineHeightTight: 1.2,
    lineHeightNormal: 1.45,
    lineHeightRelaxed: 1.65,
    fontWeightRegular: 400,
    fontWeightMedium: 500,
    fontWeightBold: 700,
};

const commonSpacing: SpacingTokens = {
    none: 0,
    xs: 8,
    sm: 12,
    md: 16,
    lg: 20,
    xl: 28,
};

const commonRadius: RadiusTokens = {
    none: 0,
    sm: 10,
    md: 12,
    lg: 16,
    pill: 999,
    full: 9999,
};

const commonShadows: ShadowTokens = {
    xs: '0 1px 0 rgba(0, 0, 0, 0.10)',
    sm: '0 10px 22px rgba(0, 0, 0, 0.12)',
    md: '0 18px 44px rgba(0, 0, 0, 0.18)',
    lg: '0 26px 70px rgba(0, 0, 0, 0.30)',
};

export const baseLightTokens: ThemeTokens = {
    colors: {
        primary: '#2f6bff',
        primarySoft: 'rgba(47, 107, 255, 0.16)',
        primaryStrong: '#1e53e6',

        info: '#2f6bff',
        muted: '#4f6fae',

        danger: '#c73552',
        warning: '#d68910',
        success: '#2fa84f',

        textPrimary: '#0b1220',
        textSecondary: '#2f4f8f',
        textMuted: '#4f6fae',

        bgPrimary: '#f7f9ff',
        bgSecondary: '#eef3ff',
        bgElevated: '#ffffff',

        borderSubtle: '#c8d7ff',
    },
    typography: {
        ...commonTypography,
    },
    spacing: {
        ...commonSpacing,
    },
    radius: {
        ...commonRadius,
    },
    shadows: {
        ...commonShadows,
    },
};

export const baseDarkTokens: ThemeTokens = {
    colors: {
        primary: '#4f8cff',
        primarySoft: 'rgba(79, 140, 255, 0.22)',
        primaryStrong: '#2e6bff',

        info: '#4f8cff',
        muted: '#9ab3ea',

        danger: '#e05a74',
        warning: '#e4a63a',
        success: '#4fc96d',

        textPrimary: '#eaf0ff',
        textSecondary: '#d3defa',
        textMuted: '#9ab3ea',

        bgPrimary: '#0b1020',
        bgSecondary: '#101a35',
        bgElevated: '#121e3d',

        borderSubtle: '#314a84',
    },
    typography: {
        ...commonTypography,
    },
    spacing: {
        ...commonSpacing,
    },
    radius: {
        ...commonRadius,
    },
    shadows: {
        ...commonShadows,
    },
};

export const defaultTheme: ThemeDefinition = {
    name: 'default',
    tokens: {
        light: baseLightTokens,
        dark: baseDarkTokens,
    },
};