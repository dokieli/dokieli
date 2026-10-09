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

const FALLBACK_PUBLIC_PATH = 'https://dokie.li/scripts/';

// Chunk file names include a content hash, so the same name on dokie.li has the same code
export async function lazyImport(load) {
  try {
    return await load();
  }
  catch (error) {
    if (error?.name !== 'ChunkLoadError' || __webpack_public_path__ === FALLBACK_PUBLIC_PATH) throw error;

    // For copies of dokieli.js without its chunks, such as a saved page
    __webpack_public_path__ = FALLBACK_PUBLIC_PATH;
    return load();
  }
}
