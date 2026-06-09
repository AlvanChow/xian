// Lenient flat config: catches real errors (undefined vars, syntax) without
// drowning the terse rendering code in style warnings.
export default [
  { ignores: ['node_modules/**', 'dist/**', 'test-results/**', 'playwright-report/**'] },
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        performance: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        setInterval: 'readonly',
        setTimeout: 'readonly',
        clearInterval: 'readonly',
        devicePixelRatio: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        Promise: 'readonly',
        localStorage: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': 'warn',
    },
  },
  {
    // Node-side files: build scripts, configs, and Playwright specs. The spec
    // callbacks passed to page.evaluate()/locator.evaluate() execute in the
    // browser, so a few browser globals are allowed here too.
    files: ['tests/**/*.js', 'tests/**/*.mjs', 'scripts/**/*.mjs', '*.js', '*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        Promise: 'readonly',
        window: 'readonly',
        document: 'readonly',
        getComputedStyle: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': 'warn',
    },
  },
];
