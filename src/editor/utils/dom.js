import { wrapIn } from "prosemirror-commands"
import { DOMSerializer } from "prosemirror-model";

// FIXME: wrapIn appears to not be applying attributes
export function toggleBlockquote(schema, attrs) {
  return (state, dispatch) => {
    const { nodes } = schema;
    const { $from } = state.selection;
    const nodeType = nodes.blockquote;
// console.log(attrs)
    if ($from.node().type === nodeType) {
// console.log(nodes.p)
      return wrapIn(nodes.p, attrs)(state, dispatch);
    }
    else {
// console.log(nodeType)
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


function getTextNodesInRange(selectionRange) {
  let rootNode = selectionRange.commonAncestorContainer;
  if (rootNode.nodeType === Node.TEXT_NODE) {
    rootNode = rootNode.parentNode;
  }
  
  const walker = document.createTreeWalker(
    rootNode,
    NodeFilter.SHOW_TEXT
  );

  const nodes = [];
  let n;
  while ((n = walker.nextNode())) nodes.push(n);
  return nodes;
}

function findRangesForTerms(terms, textNodes) {
  const ranges = [];

  textNodes.forEach(node => {
    const lower = node.textContent.toLowerCase();

    terms.forEach(term => {
      const t = term.toLowerCase();
      let pos = 0;

      while (true) {
        const index = lower.indexOf(t, pos);
        if (index === -1) break;

        const r = document.createRange();
        r.setStart(node, index);
        r.setEnd(node, index + t.length);

        ranges.push(r);
        pos = index + t.length;
      }
    });
  });

  return ranges;
}

function getHighlightPriorityLevelByType(type) {
  const map = {
    "places": 1,
    "organizations": 2,
    "acronyms": 0,
    "people": 3,
  }
  return map[type];
}

export function highlightEntities(entities, type) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const selectionRange = sel.getRangeAt(0);
  const textNodes = getTextNodesInRange(selectionRange);

  const ranges = [];
  let baseOffset = 0;

  textNodes.forEach((node, idx) => {
    const text = node.textContent;

    const nodeStartOffset = idx === 0 ? selectionRange.startOffset : 0;
    const nodeEndOffset   = idx === textNodes.length - 1 ? selectionRange.endOffset : text.length;

    entities.forEach(ent => {
      const absStart = ent.start - baseOffset;
      const absEnd   = ent.end   - baseOffset;

      const localStart = Math.max(0, absStart);
      const localEnd   = Math.min(nodeEndOffset - nodeStartOffset, absEnd);

      if (localStart < localEnd) {
        const r = document.createRange();
        r.setStart(node, nodeStartOffset + localStart);
        r.setEnd(node, nodeStartOffset + localEnd);
        ranges.push(r);
      }
    });

    baseOffset += nodeEndOffset - nodeStartOffset;
  });

  const priority = getHighlightPriorityLevelByType(type);
  const highlight = new Highlight(...ranges);
  highlight.priority = priority;

  CSS.highlights.set(`${type}-selection-highlights`, highlight);
}

