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

const ns = Config.ns;

//TODO: Review grapoi
export function processPotentialAction(resourceInfo) {
  var g = resourceInfo.graph;
  var triples = g.out().quads();
  triples.forEach(t => {
    var s = t.subject.value;
    var p = t.predicate.value;
    var o = t.object.value;

    if (p == ns.schema.potentialAction.value) {
      var action = o;
      var documentOrigin = (document.location.origin === "null") ? "file://" : document.location.origin;
      var originPathname = documentOrigin + document.location.pathname;
// console.log(originPathname)
// console.log(action.startsWith(originPathname + '#'))
      if (action.startsWith(originPathname)) {
        document.addEventListener('click', (e) => {
          var fragment = action.substr(action.lastIndexOf('#'));
// console.log(fragment)
          if (fragment) {
            var selector = '[about="' + fragment  + '"][typeof="schema:ViewAction"], [href="' + fragment  + '"][typeof="schema:ViewAction"], [resource="' + fragment  + '"][typeof="schema:ViewAction"]';
// console.log(selector)
            // var element = document.querySelectorAll(selector);
            var element = e.target.closest(selector);
// console.log(element)
            if (element) {
              e.preventDefault();
              e.stopPropagation();

              var so = g.node(rdf.namedNode(action)).out(ns.schema.object).values;
              if (so.length) {
                selector = '#' + element.closest('[id]').id;

                var svgGraph = document.querySelector(selector + ' svg');
                if (svgGraph) {
                  svgGraph.nextSibling.parentNode.removeChild(svgGraph.nextSibling);
                  svgGraph.parentNode.removeChild(svgGraph);
                }
                else {
                  // serializeGraph(g, { 'contentType': 'text/turtle' })
                  //   .then(data => {
                      var options = {};
                      options['subjectURI'] = so[0];
                      options['contentType'] = 'text/turtle';
                      DO.U.showVisualisationGraph(options.subjectURI, g.dataset.toCanonical(), selector, options);
                    // });
                }
              }
            }
          }
        });
      }
    }
  });
}

export function processActivateAction() {
  document.addEventListener('click', (e) => {
    if (e.target.closest('[about="#document-menu"][typeof="schema:ActivateAction"], [href="#document-menu"][typeof="schema:ActivateAction"], [resource="#document-menu"][typeof="schema:ActivateAction"]')) {
      e.preventDefault();
      e.stopPropagation();

      showDocumentMenu(e);
    }
  });
}
