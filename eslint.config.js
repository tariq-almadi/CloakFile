// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

/**
 * Modules that would allow the core sanitization pipeline to send document
 * contents to a third party. Importing any of these inside `packages/` is a
 * product-principle violation, not merely a style issue.
 *
 * See docs/ARCHITECTURE.md ("No external AI in the core pipeline").
 */
const NETWORK_EGRESS_MODULES = [
  {
    name: 'axios',
    message: 'Core packages must not perform network I/O. See docs/ARCHITECTURE.md.',
  },
  {
    name: 'node-fetch',
    message: 'Core packages must not perform network I/O. See docs/ARCHITECTURE.md.',
  },
  {
    name: 'undici',
    message: 'Core packages must not perform network I/O. See docs/ARCHITECTURE.md.',
  },
  { name: 'openai', message: 'The core pipeline must never send documents to an external LLM.' },
  {
    name: '@anthropic-ai/sdk',
    message: 'The core pipeline must never send documents to an external LLM.',
  },
  {
    name: '@google/generative-ai',
    message: 'The core pipeline must never send documents to an external LLM.',
  },
  {
    name: 'http',
    message: 'Core packages must not perform network I/O. See docs/ARCHITECTURE.md.',
  },
  {
    name: 'https',
    message: 'Core packages must not perform network I/O. See docs/ARCHITECTURE.md.',
  },
  {
    name: 'node:http',
    message: 'Core packages must not perform network I/O. See docs/ARCHITECTURE.md.',
  },
  {
    name: 'node:https',
    message: 'Core packages must not perform network I/O. See docs/ARCHITECTURE.md.',
  },
];

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/*.tsbuildinfo',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        // One lint-only project spanning every workspace, including test files
        // and config files. The per-package `tsconfig.json` files deliberately
        // exclude tests so they are not emitted into `dist`, which would
        // otherwise leave test files with no project for type-aware linting.
        project: ['./tsconfig.check.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
    rules: {
      // Typed error handling: we never want a bare `throw 'string'` or a
      // silently swallowed promise rejection in a security-sensitive pipeline.
      '@typescript-eslint/no-throw-literal': 'off',
      '@typescript-eslint/only-throw-error': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',

      // `any` erases the guarantees this codebase depends on.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',

      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],

      // Prototype pollution surface.
      'no-proto': 'error',
      'no-extend-native': 'error',

      // Command injection surface.
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
    },
  },

  {
    // The core sanitization packages are pure, offline logic. Enforce that
    // structurally so nobody can quietly add an LLM call or a telemetry ping.
    files: ['packages/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { paths: NETWORK_EGRESS_MODULES }],
      'no-restricted-globals': [
        'error',
        {
          name: 'fetch',
          message: 'Core packages must not perform network I/O. See docs/ARCHITECTURE.md.',
        },
      ],
      // Document contents must never reach stdout/stderr from library code.
      'no-console': 'error',
    },
  },

  {
    files: ['**/*.test.ts', '**/*.test.tsx', 'tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-console': 'off',
    },
  },

  {
    files: ['**/*.js', '**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },

  prettier,
);
