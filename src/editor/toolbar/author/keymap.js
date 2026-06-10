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

import { deleteSelection, splitBlock, newlineInCode, joinBackward } from "prosemirror-commands";
import { keymap } from "prosemirror-keymap";
import { TextSelection } from "prosemirror-state";
import { undo, redo } from "prosemirror-history";
import Config from "../../../config.js";
import { eventDlAt, moveField } from "../../eventFieldNav.js";

let Slash;

function isSlideSection(node) {
  if (node?.type.name !== 'section') return false;
  const cls = node.attrs.originalAttributes?.class || '';
  return cls.split(/\s+/).includes('slide');
}

function handleSlideHeadingEnter(state, dispatch) {
  const { $from } = state.selection;
  if (!state.selection.empty) return false;
  if ($from.parent.type.name !== 'heading') return false;
  if ($from.parentOffset !== $from.parent.content.size) return false;
  if ($from.depth < 1) return false;
  const section = $from.node($from.depth - 1);
  if (!isSlideSection(section)) return false;

  const { schema } = state;
  const headingIdx = $from.index($from.depth - 1);
  const afterHeading = $from.after($from.depth);
  const nextSibling = headingIdx + 1 < section.childCount ? section.child(headingIdx + 1) : null;

  let tr = state.tr;
  if (!nextSibling || nextSibling.type.name !== 'descriptionDiv') {
    const descDiv = schema.nodes.descriptionDiv.create(
      { originalAttributes: { datatype: 'rdf:HTML', property: 'schema:description' } },
      schema.nodes.p.create()
    );
    tr = tr.insert(afterHeading, descDiv);
  }
  tr.setSelection(TextSelection.create(tr.doc, afterHeading + 2));
  if (dispatch) dispatch(tr);
  return true;
}

function handleSlideEmptyDescBackspace(state, dispatch) {
  const { $from } = state.selection;
  if (!state.selection.empty) return false;
  if ($from.parentOffset !== 0) return false;
  if ($from.parent.content.size !== 0) return false;
  if ($from.depth < 2) return false;

  const descDiv = $from.node($from.depth - 1);
  if (descDiv.type.name !== 'descriptionDiv') return false;
  if (descDiv.childCount !== 1) return false;

  const section = $from.node($from.depth - 2);
  if (!isSlideSection(section)) return false;

  let headingEnd = null;
  let cursor = $from.before($from.depth - 2) + 1;
  for (let i = 0; i < section.childCount; i++) {
    const child = section.child(i);
    if (child.type.name === 'heading') {
      headingEnd = cursor + child.nodeSize - 1;
      break;
    }
    cursor += child.nodeSize;
  }
  if (headingEnd === null) return false;

  const descDivStart = $from.before($from.depth - 1);
  const tr = state.tr.delete(descDivStart, descDivStart + descDiv.nodeSize);
  tr.setSelection(TextSelection.create(tr.doc, headingEnd));
  if (dispatch) dispatch(tr);
  return true;
}

function customEnterCommand(state, dispatch) {
  const { selection } = state;
  const { $from } = selection;
  const { schema, tr } = state;

  let isCodeBlock = false;
  let isListItem = false;
  let listItemDepth = null;
  let node;

  for (let depth = $from.depth; depth > 0; depth--) {
    node = $from.node(depth);

    var nodeName = node.type.name.toLowerCase();

    if (nodeName === 'pre') {
      isCodeBlock = true;
      break;
    }
    else if (nodeName === 'li' || nodeName === 'dt' || nodeName === 'dd') {
      isListItem = true;
      listItemDepth = depth;
      break;
    }
    else if (nodeName === 'section') {
      // don't go past past a section boundary
      break;
    }
  }

  if (isCodeBlock) {
    return newlineInCode(state, dispatch);
  }

  if (handleSlideHeadingEnter(state, dispatch)) return true;

  if (isListItem && listItemDepth !== null) {
    let liType = node.type;

    switch (node.type) {
      case "li":
        liType = node.type;
        break;
      case "dd": 
        liType = schema.nodes.dt;
        break;
      case "dt":
        liType = schema.nodes.dd;
        break;
    }

    const paragraphType = schema.nodes.p;

    const newListItem = liType.create(
      {}, 
      paragraphType.create()
    );

    const insertPos = $from.after(listItemDepth);

    tr.insert(insertPos, newListItem);

    dispatch(tr.setSelection(TextSelection.create(tr.doc, insertPos + 2)));

    return true;
  }

  return splitBlock(state, dispatch);
}

function checkForSlashCommand(view) {
  const { selection } = view.state;
  const { $from } = selection;

  Slash = Config.Editor.slashMenu;

  const textBefore = $from.parent.textBetween(0, $from.parentOffset, null, "\n");

  if (textBefore === "/") {
    const coords = view.coordsAtPos($from.pos);

    Slash.showMenu(coords.left, coords.top);
  } else {
    Slash.hideMenu();
  }
}

function customBackspaceCommand(state, dispatch) {
  const { selection } = state;
  const { $from } = selection;
  const textBefore = $from.parent.textBetween(0, $from.parentOffset, null, "\n");

  if (textBefore === "/") {
    Slash.hideMenu();
  }

  if (!selection.empty) {
    return deleteSelection(state, dispatch);
  }

  if (handleSlideEmptyDescBackspace(state, dispatch)) return true;

  // In a placeholder-protected field, delete the char ourselves so the browser
  // can't merge the emptied block into the preceding label (which desyncs into a
  // stray line break). At block start, fall through to the protected join.
  if ($from.parentOffset > 0 && $from.parent.attrs.originalAttributes?.['data-placeholder']) {
    if (dispatch) dispatch(state.tr.delete($from.pos - 1, $from.pos).scrollIntoView());
    return true;
  }

  return joinBackward(state, dispatch);
}

function customSlashCommand(state, dispatch, view) {
  setTimeout(() => checkForSlashCommand(view), 50);
  return false; 
}

// Tab moves between event-card fields; returns false elsewhere so Tab stays
// normal in the rest of the editor.
function eventFieldTab(dir) {
  return (state, dispatch, view) => {
    if (!eventDlAt(state, state.selection.from)) return false;
    const { $from } = state.selection;
    return moveField(view, $from.before($from.depth), dir);
  };
}

// At a text field's edge, step into the adjacent native input; otherwise leave
// arrow motion to PM (text-to-text movement already works).
function eventFieldArrow(dir) {
  return (state, dispatch, view) => {
    const sel = state.selection;
    if (!sel.empty) return false;
    if (!eventDlAt(state, sel.from)) return false;
    const { $from } = sel;
    const atEdge = dir === 1
      ? $from.parentOffset === $from.parent.content.size
      : $from.parentOffset === 0;
    if (!atEdge) return false;
    return moveField(view, $from.before($from.depth), dir, "dom");
  };
}

export const keymapPlugin = keymap({
  "Backspace": customBackspaceCommand,
  "Enter": customEnterCommand,
  "/": (state, dispatch, view) => customSlashCommand(state, dispatch, view),
  "Tab": eventFieldTab(1),
  "Shift-Tab": eventFieldTab(-1),
  "ArrowDown": eventFieldArrow(1),
  "ArrowRight": eventFieldArrow(1),
  "ArrowUp": eventFieldArrow(-1),
  "ArrowLeft": eventFieldArrow(-1),
  "Mod-z": undo,
  "Mod-y": redo,
});
