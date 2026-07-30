import { defineConfig } from '@santi020k/eslint-config-basic'

export default await defineConfig(
  {},
  {
    files: ['**/*.astro'],
    rules: {
      '@typescript-eslint/no-misused-promises': 'off',
    },
  },
  {
    files: [
      '**/*.astro/*.js',
      '*.astro/*.js',
      '**/*.astro/*.ts',
      '*.astro/*.ts',
    ],
    rules: {
      '@stylistic/indent': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-undef': 'off',
      'no-unused-vars': 'off',
    },
  },
)
