import jestPlugin from 'eslint-plugin-jest';

export default [
  {
    languageOptions: {
      globals: {
        browser: 'readonly',
        chrome: 'readonly',
        DO: 'writable',
      },
      ecmaVersion: 2022,
    },
    rules: {
      'no-unused-vars': 'off',
      'no-useless-escape': 'off',
      'no-prototype-builtins': 'off',
    },
    plugins: {
      jest: jestPlugin,
    },
    ignores: ['node_modules', 'scripts/', 'playwright-report/'],
    settings: {
      jest: {
        version: 29,
      },
    },
  },
];
