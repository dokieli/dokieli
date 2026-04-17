import { Plugin } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import { i18n } from "../../i18n.js";

export const placeholderPlugin = new Plugin({
  props: {
    decorations(state) {
      const { doc, selection } = state;
      const { $from } = selection;
      const decorations = [];

      const parentNode = $from.parent;
      if (
        parentNode.type.name === "p" &&
        parentNode.content.size === 0
      ) {
        const pos = $from.before($from.depth);
        decorations.push(
          Decoration.node(pos, pos + parentNode.nodeSize, {
            class: "editor-empty-node",
            "data-placeholder": i18n.t("editor.placeholder.slash-hint")
          })
        );
      }

      return DecorationSet.create(doc, decorations);
    }
  }
});
