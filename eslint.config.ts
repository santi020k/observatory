import { defineConfig, Extension, Tool } from '@santi020k/eslint-config-basic'
import astroDoctorPlugin from '@santi020k/eslint-plugin-astro-doctor'

export default await defineConfig(
  {
    detectRootDir: import.meta.dirname,
    extensions: [Extension.Unicorn, Extension.Security],
    features: {
      jsonc: false,
      perfectionist: false,
      zod: true,
    },
    frameworks: {
      astro: true,
    },
    ignores: [
      '**/.astro/**',
      '**/.wrangler/**',
      '**/coverage/**',
      '**/dist/**',
      '**/*.json',
      '**/*.jsonc',
    ],
    tools: [Tool.Prettier],
    tsconfigRootDir: import.meta.dirname,
    typescript: true,
  },
  astroDoctorPlugin.configs.recommended,
  {
    files: ['**/*.astro'],
    rules: {
      '@typescript-eslint/no-misused-promises': 'off',
    },
  },
  {
    files: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      'vitest/consistent-test-it': 'off',
    },
  },
  {
    files: ['eslint.config.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
  {
    files: ['apps/api/src/index.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    rules: {
      'n/no-process-exit': 'off',
    },
  },
)
