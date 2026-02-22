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

import rdf from "rdf-ext";
import { showUserIdentityInput, signOut, userInfoSignOut } from "./auth.js";
import { i18n } from "./i18n.js";
import Config from "./config.js";
import { stripFragmentFromString } from "./uri.js";
import { getGraphDescription, getGraphImage, getGraphTitle, getResourceGraph } from "./graph.js";
import { fragmentFromString, removeChildren } from "./utils/html.js";
import { parseISODuration, uniqueArray } from "./util.js";

const ns = Config.ns;

export function emitDocEvent(name, detail = {}) {
  document.dispatchEvent(new CustomEvent(`dokieli:${name}`, {
    bubbles: true,
    detail
  }));
}

export function eventButtonClose() {
  document.addEventListener('click', e => {
    var button = e.target.closest('button.close')
    if (button) {
      var parent = button.parentNode;
      parent.parentNode.removeChild(parent);
    }
  });
}

export function eventButtonSignIn() {
  document.addEventListener('click', e => {
    var button = e.target.closest('button.signin-user');
    if (button) {
      button.disabled = true;
      showUserIdentityInput();
    }
  });
}

export function eventButtonSignOut() {
  document.addEventListener('click', async (e) => {
    var button = e.target.closest('button.signout-user');
    if (button) {
      button.disabled = true;
      await signOut();
      var userInfo = document.getElementById('user-info');
      if (userInfo) {
        await userInfoSignOut(userInfo);
      }
    }
  });
}

export function eventButtonNotificationsToggle() {
  document.addEventListener('click', e => {
    var button = e.target.closest('button.toggle');
    if (button) {
      var aside = button.closest('aside');
      aside.classList.toggle("on");

      window.history.replaceState({}, null, Config.DocumentURL);
    }
  });
}

//TODO: Inform the user that this information feature may fetch a resource from another origin, and ask whether they want to go ahead with it.
export function eventButtonInfo() {
  const errorMessage = `<p class="error" data-i18n="info.button-info.error.p">${i18n.t('info.button-info.error.p.textContent')}</p>`;

  document.addEventListener('click', e => {
    // restore the aside's sections and clear div.info
    const backButton = e.target.closest('button.do-info-back');
    if (backButton) {
      const aside = backButton.closest('.do');
      if (aside) {
        const infoDiv = aside.querySelector('div.info');
        if (infoDiv) { removeChildren(infoDiv); }
        aside.querySelectorAll('[data-do-info-hidden]').forEach(el => {
          el.hidden = false;
          el.removeAttribute('data-do-info-hidden');
        });
        aside.querySelectorAll('button.info[disabled]').forEach(btn => { btn.disabled = false; });
      }
      return;
    }

    const button = e.target.closest('button.info[rel="rel:help"][resource][title]:not([disabled])');

    if (button) {
      button.disabled = true;

      const aside = button.closest('.do');
      if (!aside) return;

      const infoDiv = aside.querySelector('div.info');
      if (!infoDiv) return;

      // Clear any existing info content and re-enable other disabled info buttons
      removeChildren(infoDiv);
      aside.querySelectorAll('button.info[disabled]').forEach(btn => {
        if (btn !== button) btn.disabled = false;
      });

      // Hide all direct-child content elements (sections, divs, etc.) except for h2, h3, .close, and .info
      aside.querySelectorAll(':scope > :not(h2):not(h3):not(.close):not(.info)').forEach(el => {
        if (!el.hasAttribute('data-do-info-hidden')) {
          el.hidden = true;
          el.setAttribute('data-do-info-hidden', '');
        }
      });

      const asideTitle = Array.from(aside.querySelector('h2, h3')?.childNodes || [])
        .filter(n => n.nodeType === Node.TEXT_NODE)
        .map(n => n.textContent.trim())
        .join(' ').trim();
      const backLabel = asideTitle ? `← Back to ${asideTitle.toLowerCase()}` : i18n.t('info.button-info.back.button.textContent');
      const backButtonHTML = `<button class="do-info-back" type="button">${backLabel}</button>`;

      const resource = button.getAttribute('resource');
      const url = stripFragmentFromString(resource);

      if (!url) { return; }

      let title = '';
      let description = '';
      let image = '';
      let video = '';
      let panel = '';
      let seeAlso = '';
      let subject = '';

      // console.log(title) 
      //TODO: Possibly change reuse of Config.Resource to Cache API or something
      var getInfoGraph = function () {
        if (Config.Resource[url]) {
          return Promise.resolve(Config.Resource[url].graph);
        }
        else {
          return getResourceGraph(url)
            .then(graph => {
              Config.Resource[url] = { graph };
              return graph;
            });
        }
      };

      getInfoGraph()
        .then(g => {
          // console.log(g)
          var infoG = g.node(rdf.namedNode(resource));
          // console.log(infoG.dataset.toCanonical())
          title = getGraphTitle(infoG);
          description = getGraphDescription(infoG);
          // console.log(title, description)

          let imageUrl = getGraphImage(infoG);

          let seeAlsos = infoG.out(ns.rdfs.seeAlso).values;
          // console.log(seeAlsos);

          let subjects = infoG.out(ns.dcterms.subject).values;
          // console.log(subjects);

          //TODO: Multiple video values
          let videoObject = infoG.out(ns.schema.video).value;
          // console.log(videoObject);

          if (title && description) {
            if (imageUrl) {
              imageUrl = new URL(imageUrl).href;
              image = `
                <figure>
                  <img alt="" rel="schema:image" src="${imageUrl}" />
                </figure>
              `;
            }

            let videoContentUrl, videoEncodingFormat, videoThumbnailUrl, videoDuration, videoDurationLabel;

            if (videoObject) {
              let videoObjectGraph = g.node(rdf.namedNode(videoObject));

              if (videoObjectGraph) {
                videoContentUrl = videoObjectGraph.out(ns.schema.contentUrl).value;
                videoEncodingFormat = videoObjectGraph.out(ns.schema.encodingFormat).value;
                videoThumbnailUrl = videoObjectGraph.out(ns.schema.thumbnailUrl).value;
                videoDuration = videoObjectGraph.out(ns.schema.duration).value;
                // console.log(videoContentUrl, videoEncodingFormat, videoThumbnailUrl, videoDuration);

                if (videoDuration) {
                  videoDurationLabel = parseISODuration(videoDuration);
                  // console.log(videoDurationLabel);
                }
              }
            }

            if (videoContentUrl) {
              let figcaption = '';
              let duration = '';
              let encodingFormat = '';
              let comma = (videoDuration && videoEncodingFormat) ? `, ` : '';
              let thumbnailUrl = '';
              let videoPoster = '';

              if (videoDuration || videoEncodingFormat) {
                if (videoDuration) {
                  duration = `<time datatype="xsd:duration" datetime="${videoDuration}" property="schema:duration">${videoDurationLabel}</time>`;
                }

                if (videoEncodingFormat) {
                  encodingFormat = `<span lang="" property="schema:encodingFormat" xml:lang="">${videoEncodingFormat}</span>`;
                }

                if (videoThumbnailUrl) {
                  thumbnailUrl = ` (<a data-i18n="info.button-info.poster.a" href="${videoThumbnailUrl}">${i18n.t('info.button-info.poster.a.textContent')}</a>)`;
                  videoPoster = ` poster="${videoThumbnailUrl}"`;
                }

                figcaption = `
                  <figcaption><a href="${videoContentUrl}" data-i18n="info.button-info.video.a">${i18n.t('info.button-info.video.a.textContent')}</a>${thumbnailUrl} [${duration}${comma}${encodingFormat}]</figcaption>
                `;
              }

              video = `
                <figure about="${videoObject}" id="figure-dokieli-notifications" rel="schema:video" resource="#figure-dokieli-notifications">
                  <video controls="controls" crossorigin="anonymous"${videoPoster} preload="none" resource="${videoObject}" typeof="schema:VideoObject" width="800">
                    <source rel="schema:contentUrl" src="${videoContentUrl}" />
                  </video>
                  ${figcaption}
                </figure>
                `;
            }

            if (seeAlsos) {
              seeAlsos = uniqueArray(seeAlsos).sort();

              if (seeAlsos.length) {
                seeAlso = `
                  <dt data-i18n="info.button-info.see-also.dt">${i18n.t('info.button-info.see-also.dt.textContent')}</dt><dd><ul dir="auto">
                  ${seeAlsos.map(seeAlsoIRI => {
                  const seeAlsoIRIG = g.node(rdf.namedNode(seeAlsoIRI));
                  const seeAlsoTitle = getGraphTitle(seeAlsoIRIG) || seeAlsoIRI;
                  return `<li dir="auto"><a href="${seeAlsoIRI}" rel="rdfs:seeAlso noopener" target="_blank">${seeAlsoTitle}</a></li>`;
                }).join('')}
                  </ul></dd>
                `;
              }
            }

            if (subjects) {
              subjects = uniqueArray(subjects).sort();

              const subjectItems = [];

              subjects.forEach(subjectIRI => {
                const subjectIRIG = g.node(rdf.namedNode(subjectIRI));
                const subjectTitle = getGraphTitle(subjectIRIG);
                const subjectDescription = getGraphDescription(subjectIRIG);
                // console.log(subjectTitle, subjectDescription);

                if (subjectTitle.length && subjectDescription.length) {
                  subjectItems.push(`
                    <dt about="${subjectIRI}" property="skos:prefLabel">${subjectTitle}</dt>
                    <dd about="${subjectIRI}" property="skos:definition">${subjectDescription}</dd>
                  `);
                }
              })

              if (subjectItems.length) {
                subject = `
                  <dt data-i18n="info.button-info.subjects.dt" dir="auto">${i18n.t('info.button-info.subjects.dt.textContent')}</dt><dd><dl dir="auto">
                  ${subjectItems.join('')}
                  </dl></dd>
                `;
              }
            }

            //XXX: the target attribute is sanitized by DOMPurify in fragmentFromString, so it doesn't output at the moment
            panel = `
              <div about="${resource}" class="do-info-panel" dir="auto">
                <h3 property="schema:name">${title}</h3>
                ${image}
                <div datatype="rdf:HTML" dir="auto" property="schema:description">
                ${description}
                </div>
                ${video}
                <dl dir="auto">
                  <dt data-i18n="info.button-info.source.dt">${i18n.t('info.button-info.source.dt.textContent')}</dt>
                  <dd><a dir="ltr" href="${resource}" rel="dcterms:source noopener" target="_blank">${resource}</a></dd>
                  ${subject}
                  ${seeAlso}
                </dl>
              </div>
            `;
          }

          return panel || errorMessage;
        })
        .then(panel => {
          infoDiv.prepend(fragmentFromString(panel));
          infoDiv.prepend(fragmentFromString(backButtonHTML));
        })
        .catch(() => {
          button.disabled = false;
          // Restore sections on fetch error
          aside.querySelectorAll('[data-do-info-hidden]').forEach(el => {
            el.hidden = false;
            el.removeAttribute('data-do-info-hidden');
          });
          infoDiv.prepend(fragmentFromString(errorMessage));
        });
    }
  });
}
