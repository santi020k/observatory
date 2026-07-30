import { defineConfig, Extension } from '@santi020k/eslint-config-basic'

const config = await defineConfig(
  {
    extensions: [Extension.Unicorn, Extension.Security],
    ignores: [
      '**/.astro/**',
      '**/.wrangler/**',
      '**/coverage/**',
      '**/dist/**',
      '**/*.json',
      '**/*.jsonc',
    ],
  },
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
    rules: {
      complexity: 'off',
    },
  },
  {
    files: ['apps/api/src/**/*.ts'],
    rules: {
      complexity: 'off',
      'no-console': 'off',
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    rules: {
      'n/no-process-exit': 'off',
      'no-console': 'off',
    },
  },
)

const stylisticPlugin = config
  .find(({ plugins }) => plugins?.['@stylistic'])
  ?.plugins?.['@stylistic']

const disabledStylisticRules = Object.fromEntries(
  Object.keys(stylisticPlugin?.rules ?? {})
    .map(rule => [`@stylistic/${rule}`, 'off']),
)

export default [
  ...config,
  {
    rules: {
      ...disabledStylisticRules,
      complexity: 'off',
    },
  },
]
