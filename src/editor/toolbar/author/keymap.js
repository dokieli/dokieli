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
import { SlashMenu } from "../../slashmenu/slashmenu.js";
import { TextSelection } from "prosemirror-state";
import { undo, redo } from "prosemirror-history";

let Slash;

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
  }

  if (isCodeBlock) {
    return newlineInCode(state, dispatch);
  }

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

  Slash = new SlashMenu(view);

  const textBefore = $from.parent.textBetween(0, $from.parentOffset, null, "\n");

  if (textBefore === "/" || textBefore.substring(textBefore.length - 2) === " /") {
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

  return joinBackward(state, dispatch);
}

function customSlashCommand(state, dispatch, view) {
  setTimeout(() => checkForSlashCommand(view), 50);
  return false; 
}

export const keymapPlugin = keymap({
  "Backspace": customBackspaceCommand,
  "Enter": customEnterCommand,
  "/": (state, dispatch, view) => customSlashCommand(state, dispatch, view),
  "Mod-z": undo,
  "Mod-y": redo,
});
