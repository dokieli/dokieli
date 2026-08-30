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

// A bib: { id, shortName, title, url, rel, authors, publisher, date, status }.

export function bibref(bib) {
  return `[<cite><a class="bibref" href="#bib-${bib.id}">${bib.shortName}</a></cite>]`;
}

export function bibliographyEntry(bib) {
  return `<dt id="bib-${bib.id}">[${bib.shortName}]</dt>`
    + `<dd><cite><a href="${bib.url}" rel="${bib.rel}">${bib.title}</a></cite>. ${bib.authors}.  ${bib.publisher}. ${bib.date}. ${bib.status}. URL: <a href="${bib.url}">${bib.url}</a></dd>`;
}
