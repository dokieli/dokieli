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

import { wrapIn } from "prosemirror-commands"
import { DOMParser, DOMSerializer } from "prosemirror-model";

// FIXME: wrapIn appears to not be applying attributes
export function toggleBlockquote(schema, attrs) {
  return (state, dispatch) => {
    const { nodes } = schema;
    const { $from } = state.selection;
    const nodeType = nodes.blockquote;
console.log(attrs)
    if ($from.node().type === nodeType) {
console.log(nodes.p)
      return wrapIn(nodes.p, attrs)(state, dispatch);
    }
    else {
console.log(nodeType)
      return wrapIn(nodeType, attrs)(state, dispatch);
    }
  };
}

//Input ProseMirror doc and selection from and to positions, and return HTML string including all nodes.
export function docSelectionToHtml(doc, from, to) {
  const selectedSlice = doc.slice(from, to);
  const serializer = DOMSerializer.fromSchema(doc.type.schema);
  const fragment = serializer.serializeFragment(selectedSlice.content);
  const selectedContent = new XMLSerializer().serializeToString(fragment);
  return selectedContent;
}