/*!
Copyright 2012-2026 Sarven Capadisli <https://csarven.ca/>
Copyright 2023-2026 Virginia Balseiro <https://virginiabalseiro.com/>

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import Config from './config.js';
import { getDeviceStorageItem, setDeviceStorageItem } from './storage.js';

const THEME_STORAGE_KEY = 'DO.Config.UI.Theme';
const THEMES = ['light', 'dark', 'auto'];

// 'auto' removes the attribute so the prefers-color-scheme media query applies.
export function applyTheme(theme) {
  const t = THEMES.includes(theme) ? theme : 'auto';
  const root = document.documentElement;

  if (t === 'auto') {
    delete root.dataset.theme;
  }
  else {
    root.dataset.theme = t;
  }

  if (Config.User?.UI) {
    Config.User.UI.Theme = t;
  }

  document.dispatchEvent(new CustomEvent('do-theme-changed', { detail: { theme: t } }));

  return t;
}

export async function setTheme(theme) {
  const t = applyTheme(theme);

  try {
    await setDeviceStorageItem(THEME_STORAGE_KEY, t);
  }
  catch (e) {
    console.error('dokieli: theme persist failed', e);
  }

  return t;
}

let themeControlsBound = false;

export function bindThemeControls() {
  if (themeControlsBound) { return; }
  themeControlsBound = true;

  document.addEventListener('change', (e) => {
    const input = e.target.closest('input[name="do-display-theme"]');
    if (!input) { return; }

    setTheme(input.value);
  });
}

export async function initTheme() {
  let stored = 'auto';

  try {
    stored = (await getDeviceStorageItem(THEME_STORAGE_KEY)) || 'auto';
  }
  catch (e) {}

  applyTheme(stored);
  bindThemeControls();
}
