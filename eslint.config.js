import jestPlugin from 'eslint-plugin-jest';
import licenseHeader from 'eslint-plugin-license-header';

export default [
  // Global linting for the whole project
  {
    languageOptions: {
      globals: {
        browser: 'readonly',
        chrome: 'readonly',
        DO: 'writable',
      },
      ecmaVersion: 2022,
    },
    plugins: {
      jest: jestPlugin,
    },
    rules: {
      'no-unused-vars': 'off',
      'no-useless-escape': 'off',
      'no-prototype-builtins': 'off',
    },
    ignores: ['node_modules', 'scripts/', 'playwright-report/'],
    settings: {
      jest: {
        version: 29,
      },
    },
  },

  // License header only in src and tests
  {
    files: ['src/**/*.js', 'src/**/*.ts', 'tests/**/*.js', 'tests/**/*.ts'],
    plugins: {
      'license-header': licenseHeader,
    },
    rules: {
      'license-header/header': [
        'error',
        [
          '/*!',
          'Copyright 2012-2026 Sarven Capadisli <https://csarven.ca/>',
          'Copyright 2023-2026 Virginia Balseiro <https://virginiabalseiro.com/>',
          '',
          'Licensed under the Apache License, Version 2.0 (the "License");',
          'you may not use this file except in compliance with the License.',
          'You may obtain a copy of the License at',
          '',
          '    http://www.apache.org/licenses/LICENSE-2.0',
          '',
          'Unless required by applicable law or agreed to in writing, software',
          'distributed under the License on an "AS IS" BASIS,',
          'WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.',
          'See the License for the specific language governing permissions and',
          'limitations under the License.',
          '*/',
        ],
      ],
    },
  },
];
