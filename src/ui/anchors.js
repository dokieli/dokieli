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

import { fragmentFromString, selectArticleNode } from '../utils/html.js';
import { registerDocumentTransform, registerEditorParseTransform } from '../utils/documentTransforms.js';
import { applySectionNumbers, numberTree, removeSectionNumbers, sectionTree, tocHTML } from './toc.js';
import { applySelfLinks, removeSelfLinks } from './selfLinks.js';
import { selfLinksEnabledForRoot, templateForRoot, tocEnabledForRoot, tocSchemeForRoot, unnumberedIdsForRoot } from './templates/sections.js';
import { i18n } from '../i18n.js';

// Section numbers and self-links: written on save, stripped before the editor parses, put
// back on the way to read mode. Author mode shows them as decorations (documentAnchors.js).

function tocContainer(root) {
  return root.querySelector(':scope > #content, :scope > div#content') || root;
}

// For documents without a section template; templates inject their own.
function injectGenericTOC(root) {
  root.querySelectorAll(':scope > nav.do-toc').forEach(n => n.remove());
  if (!tocEnabledForRoot(root) || templateForRoot(root)) return;
  if (root.querySelector(':scope > nav:not(.do-toc)')) return;

  const container = tocContainer(root);
  const scheme = tocSchemeForRoot(root);
  const tree = numberTree(sectionTree(container), scheme, { unnumberedIds: unnumberedIdsForRoot(root) });
  const html = tocHTML(tree, { label: i18n.t('toc.h2.textContent'), scheme, allowEmpty: true });
  if (!html) return;

  const firstSection = container.querySelector(':scope > section');
  if (firstSection) firstSection.before(fragmentFromString(html));
  else container.append(fragmentFromString(html));
}

// Removal is unconditional, so a document that stops being a spec sheds its self-links.
export function refreshDocumentAnchors(root) {
  if (!root) return;
  removeSectionNumbers(root);
  removeSelfLinks(root);
  injectGenericTOC(root);
  applySectionNumbers(tocContainer(root), {
    scheme: tocSchemeForRoot(root),
    unnumberedIds: unnumberedIdsForRoot(root),
  });
  if (selfLinksEnabledForRoot(root)) applySelfLinks(root);
}

export function stripDocumentAnchors(root) {
  if (!root) return;
  removeSectionNumbers(root);
  removeSelfLinks(root);
  root.querySelectorAll(':scope > nav.do-toc').forEach((nav) => {
    if (!templateForRoot(root)) nav.remove();
  });
}

// After the templates' own TOC injection, so the TOC it reads is in place.
registerDocumentTransform((doc) => {
  const article = selectArticleNode(doc);
  if (!article) return;
  removeSectionNumbers(article);
  removeSelfLinks(article);
  injectGenericTOC(article);
  applySectionNumbers(tocContainer(article), {
    scheme: tocSchemeForRoot(article),
    unnumberedIds: unnumberedIdsForRoot(article),
  });
  if (selfLinksEnabledForRoot(article)) applySelfLinks(article);
});

registerEditorParseTransform((root) => stripDocumentAnchors(root));
