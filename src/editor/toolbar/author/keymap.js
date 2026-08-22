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

import { deleteSelection, splitBlock, newlineInCode, joinBackward, selectAll } from "prosemirror-commands";
import { keymap } from "prosemirror-keymap";
import { TextSelection } from "prosemirror-state";
import { undo, redo } from "prosemirror-history";
import Config from "../../../config.js";
import { eventDlAt, moveField } from "../../eventFieldNav.js";
import { findCell, goToCaption, goToCellBelow, goToFirstCell } from "../../commands/table.js";
import { tableSuggestionKeydown } from "../../plugins/tableTools.js";

let Slash;

function handleSectionHeadingEnter(state, dispatch) {
  const { $from } = state.selection;
  if (!state.selection.empty) return false;
  if ($from.parent.type.name !== 'heading') return false;
  if ($from.parentOffset !== $from.parent.content.size) return false;
  if ($from.depth < 1) return false;
  const section = $from.node($from.depth - 1);
  if (section.type.name !== 'section') return false;

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

function handleEmptyDescBackspace(state, dispatch) {
  const { $from } = state.selection;
  if (!state.selection.empty) return false;
  if ($from.parentOffset !== 0) return false;
  if ($from.parent.content.size !== 0) return false;
  if ($from.depth < 2) return false;

  const descDiv = $from.node($from.depth - 1);
  if (descDiv.type.name !== 'descriptionDiv') return false;
  if (descDiv.childCount !== 1) return false;

  const section = $from.node($from.depth - 2);
  if (section.type.name !== 'section') return false;

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

  if (handleSectionHeadingEnter(state, dispatch)) return true;

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

    // A new entry inherits the current item's attributes (RDFa) and its first
    // paragraph's editor attributes (data-placeholder), so pressing Enter in a
    // one-line entry (award/credential/contribution) adds another proper entry,
    // matching the section's "+ add" button. Scoped to <li> so event/skill fields
    // (dt/dd) keep their own behaviour.
    const isLi = node.type.name === 'li';
    const firstPara = node.firstChild;
    const paraAttrs = isLi && firstPara?.type.name === 'p' ? firstPara.attrs : {};
    const newListItem = liType.create(
      isLi ? node.attrs : {},
      paragraphType.create(paraAttrs)
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

// Deleting a selection that spans cells erases the selected text and keeps
// the cells: the default replace stitches across the boundary, pulling the
// next cell's content into the previous one.
function deleteAcrossCells(state, dispatch) {
  const { selection } = state;
  if (selection.empty) return false;

  const fromCell = findCell(state, selection.$from);
  const toCell = findCell(state, selection.$to);
  if (!fromCell || !toCell || fromCell.pos === toCell.pos) return false;

  if (dispatch) {
    const ranges = [];

    // Per-textblock intersections: text goes, every node around it stays.
    state.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
      if (!node.isTextblock) return true;

      const from = Math.max(selection.from, pos + 1);
      const to = Math.min(selection.to, pos + node.nodeSize - 1);
      if (from < to) ranges.push({ from, to });

      return false;
    });

    const tr = state.tr;
    ranges.sort((a, b) => b.from - a.from).forEach(({ from, to }) => tr.delete(from, to));
    tr.setSelection(TextSelection.create(tr.doc, tr.mapping.map(selection.from)));
    dispatch(tr);
  }

  return true;
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

  if (handleEmptyDescBackspace(state, dispatch)) return true;

  // A template placeholder paragraph (event card name/organizer/department/
  // description) is protected: edit its text, but never remove, merge or lift it.
  // Delete the char ourselves so the browser can't merge the emptied block into a
  // preceding label and desync into a stray break; at block start, swallow.
  if ($from.parent.attrs.originalAttributes?.['data-placeholder']) {
    if ($from.parentOffset > 0 && dispatch) {
      dispatch(state.tr.delete($from.pos - 1, $from.pos).scrollIntoView());
    }
    return true;
  }

  // A plain paragraph whose previous sibling is a placeholder anchor merges into it
  // with join (keeps the anchor; joinBackward would drop it when both are empty).
  if ($from.parentOffset === 0 && $from.depth >= 1) {
    const idx = $from.index($from.depth - 1);
    if (idx > 0) {
      const prev = $from.node($from.depth - 1).child(idx - 1);
      if (prev.isTextblock && prev.attrs.originalAttributes?.['data-placeholder']) {
        if (dispatch) dispatch(state.tr.join($from.before($from.depth)).scrollIntoView());
        return true;
      }
    }
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

// In a table Enter means "next row, same column"; a line break inside a cell
// is Shift-Enter. Everywhere else both fall through to the usual behaviour.
function tableAwareEnter(state, dispatch, view) {
  // The suggestion list owns Enter while an item is highlighted.
  if (view && tableSuggestionKeydown(view, 'Enter')) return true;

  if (!findCell(state)) return customEnterCommand(state, dispatch, view);
  return goToCellBelow(1)(state, dispatch);
}

// Select-all in a cell or caption takes that content first; pressing again
// takes the document. Selecting everything stays one keystroke away, and a
// stray Mod-A inside a cell no longer puts the whole document under the caret.
function scopedSelectAll(state, dispatch) {
  const { $from } = state.selection;

  let scope = null;
  for (let depth = $from.depth; depth > 0; depth--) {
    const name = $from.node(depth).type.name;
    if (name === 'th' || name === 'td' || name === 'caption') {
      scope = { from: $from.start(depth), to: $from.end(depth) };
      break;
    }
  }

  if (!scope) return selectAll(state, dispatch);

  const selection = TextSelection.between(state.doc.resolve(scope.from), state.doc.resolve(scope.to));

  // Already holding the whole scope: the second press means the document.
  if (state.selection.from <= selection.from && state.selection.to >= selection.to) {
    return selectAll(state, dispatch);
  }

  if (dispatch) dispatch(state.tr.setSelection(selection));
  return true;
}

// Up and down move between cells in the same column. Browsers left to
// themselves walk the caret through the document instead: Chrome lands in the
// last cell of the row above, Firefox leaves the table altogether.
function tableAwareArrow(direction) {
  return (state, dispatch, view) => {
    // The suggestion list owns the arrows while it is open.
    if (view && tableSuggestionKeydown(view, direction > 0 ? 'ArrowDown' : 'ArrowUp')) return true;

    // The caption is the one textblock in a table that is not a cell; down
    // from it enters the grid.
    if (!findCell(state)) {
      if (direction > 0 && goToFirstCell()(state, dispatch)) return true;
      return eventFieldArrow(direction)(state, dispatch, view);
    }

    // A cell can hold several lines, so only leave it from its first or last.
    if (view && !view.endOfTextblock(direction > 0 ? 'down' : 'up')) return false;

    if (goToCellBelow(direction, { addRow: false })(state, dispatch)) return true;

    // Off the top of the grid: the caption, rather than whatever precedes the table.
    if (direction < 0 && goToCaption()(state, dispatch)) return true;

    return eventFieldArrow(direction)(state, dispatch, view);
  };
}

export const keymapPlugin = keymap({
  "Backspace": (state, dispatch, view) => deleteAcrossCells(state, dispatch) || customBackspaceCommand(state, dispatch, view),
  "Delete": deleteAcrossCells,
  "Enter": tableAwareEnter,
  "Shift-Enter": customEnterCommand,
  "/": (state, dispatch, view) => customSlashCommand(state, dispatch, view),
  "Tab": (state, dispatch, view) => (view && tableSuggestionKeydown(view, 'Tab')) || eventFieldTab(1)(state, dispatch, view),
  "Shift-Tab": eventFieldTab(-1),
  "ArrowDown": tableAwareArrow(1),
  "ArrowRight": eventFieldArrow(1),
  "ArrowUp": tableAwareArrow(-1),
  "ArrowLeft": eventFieldArrow(-1),
  "Mod-a": scopedSelectAll,
  "Mod-z": undo,
  "Mod-y": redo,
});
