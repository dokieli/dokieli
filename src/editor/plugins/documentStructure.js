import { Plugin } from "prosemirror-state";

function findFirstHeadingIndex(parent) {
  for (let i = 0; i < parent.childCount; i++) {
    if (parent.child(i).type.name === "heading") return i;
  }
  return -1;
}

function isSubHeading(node) {
  return node.type.name === "heading" && node.attrs.level >= 2;
}

function isArticleNormalized(article) {
  for (let i = 0; i < article.childCount; i++) {
    const child = article.child(i);
    if (isSubHeading(child)) return false;
    if (child.type.name === "descriptionDiv") {
      for (let j = 0; j < child.childCount; j++) {
        if (isSubHeading(child.child(j))) return false;
      }
    }
  }
  return true;
}

function buildArticleNormalizedContent(article, schema) {
  const flat = [];
  let articleDescAttrs = null;
  article.forEach((child) => {
    if (child.type.name === "descriptionDiv") {
      if (!articleDescAttrs) articleDescAttrs = child.attrs.originalAttributes || null;
      child.forEach((c) => flat.push(c));
    } else {
      flat.push(child);
    }
  });

  const result = [];
  let bodyContent = [];
  let bodyEmitted = false;
  let sectionHeading = null;
  let sectionBody = [];

  const emitBody = () => {
    if (!bodyContent.length) {
      bodyContent = [];
      return;
    }
    const descDiv = schema.nodes.descriptionDiv.create(
      { originalAttributes: articleDescAttrs || { datatype: "rdf:HTML", property: "schema:description" } },
      bodyContent
    );
    result.push(descDiv);
    bodyContent = [];
    bodyEmitted = true;
  };

  const emitSection = () => {
    if (!sectionHeading) return;
    const sc = [sectionHeading];
    if (sectionBody.length) {
      const dd = schema.nodes.descriptionDiv.create(
        { originalAttributes: { datatype: "rdf:HTML", property: "schema:description" } },
        sectionBody
      );
      sc.push(dd);
    }
    result.push(schema.nodes.section.create({}, sc));
    sectionHeading = null;
    sectionBody = [];
  };

  for (const child of flat) {
    if (child.type.name === "heading" && child.attrs.level === 1) {
      emitBody();
      emitSection();
      result.push(child);
    } else if (isSubHeading(child)) {
      emitBody();
      emitSection();
      sectionHeading = child;
    } else if (child.type.name === "section") {
      emitBody();
      emitSection();
      result.push(child);
    } else if (sectionHeading) {
      sectionBody.push(child);
    } else {
      bodyContent.push(child);
    }
  }

  emitBody();
  emitSection();

  return result;
}

function isSectionNormalized(section) {
  const headingIdx = findFirstHeadingIndex(section);
  if (headingIdx === -1) return true;
  const after = section.childCount - headingIdx - 1;
  if (after === 0) return true;
  if (after === 1) return section.child(headingIdx + 1).type.name === "descriptionDiv";
  return false;
}

function buildSectionNormalizedContent(section, schema) {
  const headingIdx = findFirstHeadingIndex(section);
  if (headingIdx === -1) return null;

  const head = [];
  for (let i = 0; i <= headingIdx; i++) head.push(section.child(i));

  let descAttrs = null;
  const descContent = [];
  for (let i = headingIdx + 1; i < section.childCount; i++) {
    const child = section.child(i);
    if (child.type.name === "descriptionDiv") {
      if (!descAttrs) descAttrs = child.attrs.originalAttributes || {};
      child.content.forEach((c) => descContent.push(c));
    } else {
      descContent.push(child);
    }
  }

  if (!descAttrs) {
    descAttrs = { datatype: "rdf:HTML", property: "schema:description" };
  }
  if (descContent.length === 0) {
    descContent.push(schema.nodes.p.create());
  }

  const descDiv = schema.nodes.descriptionDiv.create(
    { originalAttributes: descAttrs },
    descContent
  );

  return [...head, descDiv];
}

export const documentStructurePlugin = new Plugin({
  appendTransaction(transactions, oldState, newState) {
    if (!transactions.length) return null;
    const { schema, doc } = newState;

    if (!isArticleNormalized(doc)) {
      const next = buildArticleNormalizedContent(doc, schema);
      const tr = newState.tr.replaceWith(0, doc.content.size, next);
      tr.setMeta("addToHistory", false);
      return tr;
    }

    const updates = [];
    doc.descendants((node, pos) => {
      if (node.type.name === "article") {
        if (!isArticleNormalized(node)) {
          const next = buildArticleNormalizedContent(node, schema);
          updates.push({ pos, node, next });
          return false;
        }
        return;
      }
      if (node.type.name === "section") {
        if (!isSectionNormalized(node)) {
          const next = buildSectionNormalizedContent(node, schema);
          if (next) updates.push({ pos, node, next });
          return false;
        }
      }
    });

    if (!updates.length) return null;

    let tr = newState.tr;
    for (let i = updates.length - 1; i >= 0; i--) {
      const { pos, node, next } = updates[i];
      const start = pos + 1;
      const end = pos + 1 + node.content.size;
      tr = tr.replaceWith(start, end, next);
    }

    tr.setMeta("addToHistory", false);
    return tr;
  },
});
