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

import Config from '../../config.js';
import { fragmentFromString } from '../../utils/html.js';

// Helpers shared by document templates; template-specific markup stays in each template's module.

export function isAuthorMode() {
  return Config.Editor?.mode === 'author';
}

// Null unless the author editor is live (template mutations must go through PM).
export function pmEditor() {
  return Config.Editor?.authorToolbarView?.editorView ? Config.Editor : null;
}

// Reset <html>/<head> for a new template document: UI language and an 'Untitled' title.
export function prepareDocumentForTemplate() {
  document.documentElement.setAttribute('lang', `${Config.User.UI.Language}`);
  document.documentElement.setAttribute('xml:lang', `${Config.User.UI.Language}`);
  document.documentElement.setAttribute('dir', `${Config.User.UI.LanguageDir}`);

  const titleElement = document.querySelector('head title');

  if (titleElement) {
    titleElement.textContent = 'Untitled';
  }
  else {
    const newTitle = document.createElement('title');
    newTitle.textContent = 'Untitled';
    document.head.appendChild(newTitle);
  }
}

// Replace the body with template markup, keeping #document-menu and resetting body id/class (or setting bodyClass).
export function replaceDocumentBody(html, { bodyClass } = {}) {
  const documentMenu = document.getElementById('document-menu');

  document.body.replaceChildren(fragmentFromString(html));

  if (documentMenu) document.body.prepend(documentMenu);

  document.body.removeAttribute('id');
  if (bodyClass) {
    document.body.className = bodyClass;
  }
  else {
    document.body.removeAttribute('class');
  }
}

// RDFa section: heading + schema:description container; attrs = extra attribute string for the section element.
export function sectionHTML({ id, level = 2, heading, content = '', className = '', attrs = '', rel = 'schema:hasPart', headingProperty = 'schema:name' }) {
  const classAttr = className ? ` class="${className}"` : '';
  return `<section${classAttr} id="${id}" inlist="" rel="${rel}" resource="#${id}"${attrs}><h${level} property="${headingProperty}">${heading}</h${level}><div datatype="rdf:HTML" property="schema:description">${content}</div></section>`;
}

// Note block: <div class="note"> with a "Note: <title>" heading.
export function noteHTML({ id, level = 3, title, content = '' }) {
  return `<div class="note" id="${id}" inlist="" rel="schema:hasPart" resource="#${id}"><h${level} property="schema:name"><span>Note</span>: ${title}</h${level}><div datatype="rdf:HTML" property="schema:description">${content}</div></div>`;
}

// "More details about this document" block. entries: [{ id, dt, dds: [innerHTML], className? }]
export function documentDetailsHTML(entries, { id = null, summary = 'More details about this document' } = {}) {
  const dls = entries.map(({ id, dt, dds, className }) => `  <dl${className ? ` class="${className}"` : ''} id="${id}">
    <dt>${dt}</dt>
${dds.map(dd => `    <dd>${dd}</dd>`).join('\n')}
  </dl>`).join('\n');

  return `<details${id ? ` id="${id}"` : ''} open="">
  <summary>${summary}</summary>
${dls}
</details>`;
}
