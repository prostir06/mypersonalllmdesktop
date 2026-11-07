import js from '@eslint/js';
import globals from 'globals';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/** Recommended a11y rules stay warnings so existing markup does not fail CI. */
function jsxA11yWarnings(rules) {
  return Object.fromEntries(
    Object.entries(rules).map(([name, setting]) => [
      name,
      Array.isArray(setting) ? ['warn', ...setting.slice(1)] : 'warn',
    ])
  );
}

const jsxA11yRules = jsxA11yWarnings(jsxA11y.flatConfigs.recommended.rules);

/** Typed sources strict; JSX linted gradually (wave 2). */
export default tseslint.config(
  {
    ignores: ['build/**', 'coverage/**', 'node_modules/**', 'dist/**'],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...jsxA11yRules,
      ...reactHooks.configs.recommended.rules,
      // Form hydration / data-load effects still common; keep as warn (same as JSX).
      'react-hooks/set-state-in-effect': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      'max-lines': [
        'warn',
        { max: 400, skipBlankLines: true, skipComments: true },
      ],
      'no-empty': ['warn', { allowEmptyCatch: false }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['src/**/*.{js,jsx}'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...jsxA11yRules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // Remaining JSX still hydrates forms in effects; warn while migrating to TSX.
      'react-hooks/set-state-in-effect': 'warn',
      'max-lines': [
        'warn',
        { max: 400, skipBlankLines: true, skipComments: true },
      ],
      'no-empty': ['warn', { allowEmptyCatch: false }],
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^React$',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  }
);
