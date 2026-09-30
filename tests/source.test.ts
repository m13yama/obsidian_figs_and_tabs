import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { calloutSourceStyles } from "../src/source";

function state(doc: string) {
  return EditorState.create({ doc, extensions: [calloutSourceStyles] });
}

function lines(editor: EditorState) {
  const result = new Map<number, string[]>();
  editor.field(calloutSourceStyles).between(0, editor.doc.length, (from, _to, decoration) => {
    expect(from).toBe(editor.doc.lineAt(from).from);
    result.set(editor.doc.lineAt(from).number, decoration.spec.class.split(" "));
  });
  return result;
}

describe("callout source styling", () => {
  it("distinguishes layout headers, fenced code, and real inline code", () => {
    const doc = ["> [!grid|cols=2]", "> > [!figure|width=300] Flow", "> > ```mermaid", "> > graph TD", "> > A --> B", "> > ```", ">", "> > [!table] Results", "> > Text with `inline code`", "", "Outside"];
    const result = lines(state(doc.join("\n")));
    expect([...result.keys()]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(result.get(1)).toContain("ft-source-grid");
    expect(result.get(2)).toContain("ft-source-header");
    expect(result.get(3)).toContain("ft-source-code-start");
    expect(result.get(4)).toContain("ft-source-figure");
    expect(result.get(5)).toContain("ft-source-code");
    expect(result.get(6)).toContain("ft-source-code-end");
    expect(result.get(7)).toEqual(["ft-source-line", "ft-source-grid"]);
    expect(result.get(8)).toContain("ft-source-table");
    expect(result.get(9)).not.toContain("ft-source-code");
  });

  it("leaves ordinary quotes and unrelated callouts alone, including nested ones", () => {
    const doc = ["> Ordinary quote", "", "> [!note] Note", "> Text", "", "> [!grid]", "> > [!note] Nested note", "> > Text", ">", "> > [!figure] Image", "> > ![[a.png]]", ">", "> [!warning] Warning", "> Warning text"];
    expect([...lines(state(doc.join("\n"))).keys()]).toEqual([6, 9, 10, 11, 12]);
  });

  it("ignores callout examples inside fences and keeps fake headers inside code", () => {
    const doc = ["````markdown", "> [!grid]", "> ```mermaid", "> A --> B", "> ```", "````", "> [!figure] Flow", "> ~~~mermaid", "> [!table] not a real header", "> ```", "> ~~~", "> Text"];
    const result = lines(state(doc.join("\n")));
    expect([...result.keys()]).toEqual([7, 8, 9, 10, 11, 12]);
    expect(result.get(9)).toContain("ft-source-figure");
    expect(result.get(9)).not.toContain("ft-source-header");
    expect(result.get(10)).not.toContain("ft-source-code-end");
    expect(result.get(11)).toContain("ft-source-code-end");
    expect(result.get(12)).not.toContain("ft-source-code");
  });

  it("ends an unclosed quoted fence at the quotation boundary", () => {
    const doc = ["> [!grid]", "> > [!figure] Flow", "> > ```mermaid", "> > A --> B", ">", "> > [!table] Results", "", "Outside", "", "> [!figure] Next"];
    const result = lines(state(doc.join("\n")));
    expect(result.get(5)).toEqual(["ft-source-line", "ft-source-grid"]);
    expect(result.get(6)).toContain("ft-source-table");
    expect(result.has(8)).toBe(false);
    expect(result.get(10)).toContain("ft-source-figure");
  });

  it("handles compact quotes, folding, and case without accepting indented examples", () => {
    const doc = ["    > [!grid]", ">[!GRID|cols=2]- Grid", ">>[!FIGURE]+ Caption", ">> ![[a.png]]", "", "\\> [!grid]"];
    const result = lines(state(doc.join("\n")));
    expect([...result.keys()]).toEqual([2, 3, 4]);
    expect(result.get(2)).toContain("ft-source-grid");
    expect(result.get(3)).toContain("ft-source-figure");
  });

  it("recomputes boundaries on edits without touching the document or cursor-only transactions", () => {
    let editor = state("> [!grid]\n> ```mermaid\n> A --> B\n> ```\n\nOutside");
    const decorations = editor.field(calloutSourceStyles);
    editor = editor.update({ selection: { anchor: 15 } }).state;
    expect(editor.field(calloutSourceStyles)).toBe(decorations);
    const index = editor.doc.toString().indexOf("grid");
    editor = editor.update({ changes: { from: index, to: index + 4, insert: "note" } }).state;
    expect(lines(editor).size).toBe(0);
    expect(editor.doc.toString()).toBe("> [!note]\n> ```mermaid\n> A --> B\n> ```\n\nOutside");
  });
});
