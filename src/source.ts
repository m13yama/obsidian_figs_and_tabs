import { RangeSetBuilder, StateField } from "@codemirror/state";
import type { Text } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
import type { DecorationSet } from "@codemirror/view";
import { isKind } from "./options";
import type { CalloutKind } from "./options";

interface CalloutScope {
  depth: number;
  kind: CalloutKind | null;
}

interface Fence {
  depth: number;
  marker: string;
}

/** Native highlighting treats fences inside quotes as inline code. Track their
 * source boundaries so CSS can style the whole block without changing its text. */
function decorateSource(doc: Text): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const scopes: CalloutScope[] = [];
  let fence: Fence | undefined;
  let offset = 0;

  for (const line of doc.iterLines()) {
    const from = offset;
    offset += line.length + 1;
    const prefix = /^(?: {0,3}>[\t ]?)+/.exec(line)?.[0] ?? "";
    const depth = prefix.split(">").length - 1;
    const text = line.slice(prefix.length);

    // Leaving a quotation also ends an unclosed fence inside that quotation.
    if (fence && depth < fence.depth) fence = undefined;
    if (!fence) {
      while (scopes.length && scopes[scopes.length - 1]!.depth > depth) scopes.pop();
    }

    let header = false;
    let codeStart = false;
    let codeEnd = false;
    if (fence) {
      const closing = /^ {0,3}(`{3,}|~{3,})[\t ]*$/.exec(text)?.[1];
      codeEnd = depth === fence.depth && !!closing && closing[0] === fence.marker[0] && closing.length >= fence.marker.length;
    } else {
      const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(text);
      if (marker && !(marker[1]![0] === "`" && marker[2]!.includes("`"))) {
        fence = { depth, marker: marker[1]! };
        codeStart = true;
      } else if (depth > 0) {
        const callout = /^\[!([^\]|]+)(?:\|[^\]]*)?\]/.exec(text);
        if (callout) {
          while (scopes.length && scopes[scopes.length - 1]!.depth >= depth) scopes.pop();
          const name = callout[1]!.toLowerCase();
          scopes.push({ depth, kind: isKind(name) ? name : null });
          header = true;
        }
      }
    }

    const scope = scopes[scopes.length - 1];
    if (scope?.kind && depth >= scope.depth) {
      const classes = ["ft-source-line", `ft-source-${scope.kind}`];
      if (header) classes.push("ft-source-header");
      if (fence) classes.push("ft-source-code");
      if (codeStart) classes.push("ft-source-code-start");
      if (codeEnd) classes.push("ft-source-code-end");
      builder.add(from, from, Decoration.line({ class: classes.join(" ") }));
    }
    if (codeEnd) fence = undefined;
  }
  return builder.finish();
}

/** Keep context across off-screen lines; cursor movement does not rescan a note. */
export const calloutSourceStyles = StateField.define<DecorationSet>({
  create: state => decorateSource(state.doc),
  update: (decorations, transaction) => transaction.docChanged ? decorateSource(transaction.newDoc) : decorations,
  provide: field => EditorView.decorations.from(field),
});
