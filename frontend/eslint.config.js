import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  // Jest tests: describe, test, expect and jest are globals there
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.jest },
    },
  },
  // babel.config.cjs and the test mocks use CommonJS (module.exports)
  {
    files: ['**/*.cjs', 'tests/mocks/*.js'],
    languageOptions: {
      globals: globals.node,
      sourceType: 'commonjs',
    },
  },
])
