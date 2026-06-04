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

// Post-normalization transforms registered by templates, applied in getDocument().
const transforms = new Set();

export function registerDocumentTransform(fn) {
  transforms.add(fn);
}

export function applyDocumentTransforms(doc) {
  transforms.forEach(fn => fn(doc));
}

const editorParseTransforms = new Set();

export function registerEditorParseTransform(fn) {
  editorParseTransforms.add(fn);
}

export function applyEditorParseTransforms(root) {
  editorParseTransforms.forEach(fn => fn(root));
}
