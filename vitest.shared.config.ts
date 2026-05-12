// =====================
// File: vitest.shared.config.ts
// Purpose:
// - Shared-only vitest config
// - Runs tests only from src/test/**
// - Uses stable absolute setup file path
// =====================

import { defineConfig } from 'vitest/config';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: [resolve(rootDir, 'src/test/setup.ts')],
        include: [
            'src/test/**/*.test.ts',
            'src/test/**/*.test.tsx',
        ],
        exclude: [
            'node_modules',
            'dist',
        ],
        restoreMocks: true,
        clearMocks: true,
        mockReset: true,
    },
});