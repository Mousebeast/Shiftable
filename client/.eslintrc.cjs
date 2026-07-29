module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  settings: { react: { version: '18.2' } },
  plugins: ['react-refresh'],
  rules: {
    // Off by design. It fires on two patterns this codebase uses deliberately:
    // context files exporting both a Provider and its hook (useAuth, and the
    // standard React idiom), and shadcn/ui files exporting a component plus its
    // cva variants. Both are intentional structure, and the rule only affects
    // Fast Refresh granularity in dev — never correctness.
    'react-refresh/only-export-components': 'off',
    // This codebase does not use PropTypes anywhere — it is a deliberate
    // convention, not an oversight, so the rule reports 300+ false positives.
    'react/prop-types': 'off',
    // Unused function parameters are idiomatic (event handlers, destructured
    // props kept for documentation). Unused *variables* are still real dead code.
    'no-unused-vars': ['error', { args: 'none' }],
    // Straight quotes in JSX copy render correctly; escaping them is noise.
    'react/no-unescaped-entities': 'off',
  },
  overrides: [
    {
      // Vitest runs with globals: true (see vite.config.js), so describe/it/
      // expect/vi are injected rather than imported.
      files: ['**/*.test.js', '**/*.test.jsx', 'src/test/**'],
      env: { node: true },
      globals: {
        describe: 'readonly', it: 'readonly', test: 'readonly',
        expect: 'readonly', vi: 'readonly',
        beforeEach: 'readonly', afterEach: 'readonly',
        beforeAll: 'readonly', afterAll: 'readonly',
      },
    },
    {
      // Build/config files run in Node, not the browser.
      files: ['vite.config.js', 'tailwind.config.js', 'postcss.config.js'],
      env: { node: true, browser: false },
    },
  ],
}
