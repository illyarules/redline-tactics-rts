import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      '.playwright-mcp/**',
    ],
  },
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    rules: {
      complexity: ['error', 10],
      'max-depth': ['error', 3],
      'max-params': 'off',
      '@typescript-eslint/max-params': ['warn', { max: 5 }],
      'max-statements': ['warn', 30],
      'max-lines-per-function': [
        'warn',
        {
          max: 80,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
    },
  },
);
