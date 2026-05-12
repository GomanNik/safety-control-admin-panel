// =====================
// File: src/shared/theme/context.ts
// Purpose:
// - Shared theme React context
// - SSR-safe theme application effect
// - Keep only the core public API:
//   ThemeProvider + useTheme
// =====================

import React, {
    createContext,
    useContext,
    useEffect,
    useLayoutEffect,
} from 'react';
import type {
    ReactElement,
    ReactNode,
} from 'react';

import { getGlobalLogger } from '../logging';
import { applyThemeToDocument } from './dom';
import type { ThemeContextValue } from './types';

export interface ThemeProviderProps {
    value: ThemeContextValue;
    children: ReactNode;
}

const ThemeContext =
    createContext<ThemeContextValue | undefined>(
        undefined,
    );

const useIsomorphicLayoutEffect =
    typeof window !== 'undefined'
        ? useLayoutEffect
        : useEffect;

const getThemeContextLogger = () => {
    return getGlobalLogger()
        .child('shared')
        .child('theme')
        .child('context');
};

export const ThemeProvider = ({
                                  value,
                                  children,
                              }: ThemeProviderProps): ReactElement => {
    useIsomorphicLayoutEffect(() => {
        const logger = getThemeContextLogger();

        try {
            applyThemeToDocument(value.theme, {
                themeName: value.theme.name,
                mode: value.mode,
                setDataAttributes: true,
                setClassName: true,
            });

            logger.info('Theme applied to document', {
                themeName: value.theme.name,
                mode: value.mode,
                resolvedMode: value.resolvedMode,
            });
        } catch (error) {
            logger.error(error, {
                action: 'applyThemeToDocument',
                themeName: value.theme.name,
                mode: value.mode,
                resolvedMode: value.resolvedMode,
            });
        }
    }, [value.theme, value.mode, value.resolvedMode]);

    return React.createElement(
        ThemeContext.Provider,
        { value },
        children,
    );
};

export const useTheme = (): ThemeContextValue => {
    const context = useContext(ThemeContext);

    if (!context) {
        getThemeContextLogger().error(
            'useTheme must be used within a ThemeProvider',
        );

        throw new Error(
            'useTheme must be used within a ThemeProvider',
        );
    }

    return context;
};