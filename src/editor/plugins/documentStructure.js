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

import { Plugin, Selection } from "prosemirror-state";
import { Fragment } from "prosemirror-model";

const DESCRIPTION_ATTRS = { datatype: "rdf:HTML", property: "schema:description" };
const SECTION_ATTRS = { inlist: "", rel: "schema:hasPart" };
const HEADING_PROPERTY = "schema:name";

let lastCheckedDoc = null;

function originalAttribute(node, name) {
  return node.attrs?.originalAttributes?.[name];
}

function hasClass(node, name) {
  return String(originalAttribute(node, "class") || "").split(/\s+/).includes(name);
}

function isHeading(node) {
  return node.type.name === "heading";
}

function isSection(node) {
  return node.type.name === "section";
}

function isDescription(node) {
  return node.type.name === "descriptionDiv";
}

function findHeadingIndex(node) {
  for (let i = 0; i < node.childCount; i++) {
    if (isHeading(node.child(i))) return i;
  }
  return -1;
}

// Slides own their structure; a headingless section has no place in the outline.
function isOpaqueSection(node) {
  return isSection(node) && (hasClass(node, "slide") || findHeadingIndex(node) === -1);
}

// Template chrome stands outside the outline: head matter and editor-only blocks.
function isStandalone(node) {
  return hasClass(node, "head") || hasClass(node, "do") || node.type.name === "details";
}

// Attributes are keyed by their owning heading's index, so RDFa survives a rebuild.
function flatten(fragment, items, meta, claim) {
  fragment.forEach((child) => {
    if (isDescription(child)) {
      const owner = claim.heading;
      if (!meta.description.has(owner)) meta.description.set(owner, child.attrs);
      flatten(child.content, items, meta, claim);
      return;
    }

    if (isSection(child) && !isOpaqueSection(child)) {
      const enclosing = claim.section;
      claim.section = child.attrs;
      flatten(child.content, items, meta, claim);
      claim.section = enclosing;
      return;
    }

    if (isHeading(child)) {
      claim.heading = items.length;
      if (claim.section) {
        meta.section.set(items.length, claim.section);
        claim.section = null;
      }
    }

    items.push(child);
  });
}

function withOriginalAttributes(node, extra) {
  const current = node.attrs.originalAttributes || {};
  if (Object.entries(extra).every(([name, value]) => current[name] === value)) return node;
  return node.type.create(
    { ...node.attrs, originalAttributes: { ...current, ...extra } },
    node.content,
    node.marks
  );
}

// autoIdPlugin owns the id and keeps a matching resource in step with it.
function sectionAttributes(attrs) {
  const current = attrs?.originalAttributes || {};
  const originalAttributes = { ...current, ...SECTION_ATTRS };
  if (current.id) originalAttributes.resource = "#" + current.id;
  return { ...attrs, originalAttributes };
}

function buildOutline(items, meta, schema) {
  const root = { level: 0, out: [], body: [], sections: 0, description: meta.description.get(-1) };
  const stack = [root];
  const top = () => stack[stack.length - 1];

  const flushBody = (frame, force) => {
    if (!frame.body.length && !force) return;
    const content = frame.body.length ? frame.body : [schema.nodes.p.create()];
    frame.out.push(schema.nodes.descriptionDiv.create(
      frame.description || { originalAttributes: { ...DESCRIPTION_ATTRS } },
      content
    ));
    frame.body = [];
  };

  const closeSection = () => {
    const frame = stack.pop();
    flushBody(frame, frame.sections === 0);
    const heading = withOriginalAttributes(frame.heading, { property: HEADING_PROPERTY });
    if (heading !== frame.heading) meta.replaced.set(frame.heading, heading);
    const parent = top();
    parent.out.push(schema.nodes.section.create(sectionAttributes(frame.attrs), [heading, ...frame.out]));
    parent.sections += 1;
  };

  const closeToRoot = () => {
    while (stack.length > 1) closeSection();
  };

  items.forEach((node, index) => {
    if (isHeading(node) && node.attrs.level > 1) {
      // Equal level lands as a sibling, deeper as a subsection.
      while (stack.length > 1 && top().level >= node.attrs.level) closeSection();
      flushBody(top(), false);
      stack.push({
        level: node.attrs.level,
        heading: node,
        attrs: meta.section.get(index),
        description: meta.description.get(index),
        out: [],
        body: [],
        sections: 0,
      });
      return;
    }

    // h1 titles the document; opaque sections and standalone blocks stand on their own.
    if (isHeading(node) || isSection(node) || isStandalone(node)) {
      closeToRoot();
      flushBody(root, false);
      root.out.push(node);
      return;
    }

    top().body.push(node);
  });

  closeToRoot();
  flushBody(root, false);

  return root.out;
}

function outlineContent(node, schema) {
  const items = [];
  const meta = { section: new Map(), description: new Map(), replaced: new Map() };
  flatten(node.content, items, meta, { heading: -1, section: null });

  if (!items.some((item) => isHeading(item) && item.attrs.level > 1)) return null;

  return { content: Fragment.fromArray(buildOutline(items, meta, schema)), replaced: meta.replaced };
}

// Sections outside the outline still get the heading + description shape.
function flatSectionContent(section, schema) {
  const headingIndex = findHeadingIndex(section);
  if (headingIndex === -1) return null;

  const head = [];
  for (let i = 0; i <= headingIndex; i++) head.push(section.child(i));

  let attrs = null;
  const description = [];
  for (let i = headingIndex + 1; i < section.childCount; i++) {
    const child = section.child(i);
    if (isDescription(child)) {
      if (!attrs) attrs = child.attrs;
      child.content.forEach((c) => description.push(c));
    } else {
      description.push(child);
    }
  }

  if (!description.length) description.push(schema.nodes.p.create());

  const content = Fragment.fromArray([
    ...head,
    schema.nodes.descriptionDiv.create(attrs || { originalAttributes: { ...DESCRIPTION_ATTRS } }, description),
  ]);

  return content.eq(section.content) ? null : content;
}

function collectFlatSections(node, pos, insideOutline, schema, updates) {
  node.forEach((child, offset) => {
    const childPos = pos + offset + 1;

    if (isSection(child)) {
      const owned = insideOutline && !isOpaqueSection(child);
      if (!owned) {
        const content = flatSectionContent(child, schema);
        if (content) updates.push({ pos: childPos, node: child, content });
      }
      collectFlatSections(child, childPos, owned, schema, updates);
      return;
    }

    if (child.isBlock && child.childCount && !child.isTextblock) {
      collectFlatSections(child, childPos, false, schema, updates);
    }
  });
}

// Rewrapping keeps textblock instances; nearest wins, as empty blocks can share one.
function positionOfBlock(doc, block, near) {
  let position = null;
  doc.descendants((node, pos) => {
    if (node !== block) return !node.isTextblock;
    if (position === null || Math.abs(pos - near) < Math.abs(position - near)) position = pos;
    return false;
  });
  return position;
}

// Replacing only the changed children leaves outside positions untouched.
function replaceChangedRange(tr, doc, next) {
  const current = doc.content;

  let start = 0;
  while (start < current.childCount && start < next.childCount &&
         current.child(start).eq(next.child(start))) start++;

  let endCurrent = current.childCount;
  let endNext = next.childCount;
  while (endCurrent > start && endNext > start &&
         current.child(endCurrent - 1).eq(next.child(endNext - 1))) {
    endCurrent--;
    endNext--;
  }

  let from = 0;
  for (let i = 0; i < start; i++) from += current.child(i).nodeSize;
  let to = from;
  for (let i = start; i < endCurrent; i++) to += current.child(i).nodeSize;

  const replacement = [];
  for (let i = start; i < endNext; i++) replacement.push(next.child(i));

  return tr.replaceWith(from, to, replacement);
}

export const documentStructurePlugin = new Plugin({
  appendTransaction(transactions, oldState, newState) {
    if (!transactions.length) return null;

    const { schema, doc } = newState;
    if (doc === lastCheckedDoc) return null;
    lastCheckedDoc = doc;

    const outline = outlineContent(doc, schema);

    if (outline && !outline.content.eq(doc.content)) {
      const { $from } = newState.selection;
      const block = outline.replaced.get($from.parent) || $from.parent;
      const tr = replaceChangedRange(newState.tr, doc, outline.content);
      const blockPos = block.isTextblock
        ? positionOfBlock(tr.doc, block, tr.mapping.map($from.before()))
        : null;
      tr.setSelection(Selection.near(tr.doc.resolve(
        blockPos === null ? tr.mapping.map($from.pos) : blockPos + 1 + $from.parentOffset
      )));
      tr.setMeta("addToHistory", false);
      return tr;
    }

    const updates = [];
    collectFlatSections(doc, -1, outline !== null, schema, updates);
    if (!updates.length) return null;

    let tr = newState.tr;
    for (let i = updates.length - 1; i >= 0; i--) {
      const { pos, node, content } = updates[i];
      tr = tr.replaceWith(pos + 1, pos + 1 + node.content.size, content);
    }
    tr.setMeta("addToHistory", false);
    return tr;
  },
});
