import { describe, expect, it } from "vitest";
import { changeGridColumns, wrapCaption, wrapGrid } from "../src/commands";
import type { TextEdit } from "../src/commands";

function apply(source: string, edit: TextEdit): string {
  return source.slice(0, edit.from) + edit.text + source.slice(edit.to);
}

describe("caption commands", () => {
  it("isolates a figure from both surrounding paragraphs", () => {
    const source = "前の本文\n![[image.png]]\n次の本文";
    const edit = wrapCaption(source, 5, 5, "figure");
    const result = apply(source, edit);
    expect(result).toBe("前の本文\n\n> [!figure] キャプション\n> ![[image.png]]\n\n次の本文");
    expect(result.slice(edit.anchor, edit.head)).toBe("キャプション");
  });

  it("does not consume the next line when selection ends at column zero", () => {
    const source = "| A | B |\n| --- | --- |\n| 1 | 2 |\n本文";
    const edit = wrapCaption(source, 0, source.indexOf("本文"), "table");
    expect(apply(source, edit)).toBe("> [!table] キャプション\n> | A | B |\n> | --- | --- |\n> | 1 | 2 |\n\n本文");
  });

  it("preserves the surrounding quote depth inside an existing grid", () => {
    const source = "> [!grid]\n> ![[a.png]]\n> 続き";
    const edit = wrapCaption(source, source.indexOf("![["), source.indexOf("![["), "figure");
    expect(apply(source, edit)).toBe("> [!grid]\n>\n> > [!figure] キャプション\n> > ![[a.png]]\n>\n> 続き");
  });

  it("provides templates on an empty line and handles reversed selections", () => {
    expect(apply("", wrapCaption("", 0, 0, "table"))).toContain("> | --- | --- |");
    const source = "![[a.png]]";
    expect(wrapCaption(source, source.length, 0, "figure")).toEqual(wrapCaption(source, 0, source.length, "figure"));
  });

  it("rejects rewrapping an existing callout instead of accidentally nesting it", () => {
    const source = "> [!figure] A\n> ![[a.png]]";
    expect(() => wrapCaption(source, 0, source.length, "figure")).toThrow("既存のcallout");
  });

  it("does not split an existing table when there is no selection", () => {
    const source = "| A | B |\n| --- | --- |\n| 1 | 2 |";
    expect(() => wrapCaption(source, 0, 0, "table")).toThrow("表全体を選択");
  });
});

describe("grid commands", () => {
  const figures = "> [!figure] A\n> ![[a.png]]\n\n> [!table] B\n> | A | B |\n> | --- | --- |";

  it("retains the grid between children and terminates it before the following paragraph", () => {
    const source = figures + "\n本文";
    expect(apply(source, wrapGrid(source, 0, figures.length, 2, 24, 16)))
      .toBe("> [!grid|cols=2 lgap=24 vgap=16]\n> > [!figure] A\n> > ![[a.png]]\n>\n> > [!table] B\n> > | A | B |\n> > | --- | --- |\n\n本文");
  });

  it("adds one quote level to nested callouts without escaping their parent", () => {
    const source = figures.split("\n").map(line => line ? `> ${line}` : ">").join("\n");
    const output = apply(source, wrapGrid(source, 0, source.length, 3, 8, 12));
    expect(output).toContain("> > [!grid|cols=3 lgap=8 vgap=12]\n> > > [!figure] A");
    expect(output).toContain("\n> >\n> > > [!table]");
  });

  it("rejects selections containing unquoted text", () => {
    const source = figures + "\n\n外の本文";
    expect(() => wrapGrid(source, 0, source.length, 2, 24, 16)).toThrow("calloutの外");
    expect(() => wrapGrid("本文", 0, 2, 2, 24, 16)).toThrow("callout全体");
  });

  it("inserts a two-figure template at an empty cursor", () => {
    const output = apply("", wrapGrid("", 0, 0, 2, 24, 16));
    expect(output).toContain("> > [!figure] 図A");
    expect(output).toContain("\n>\n> > [!figure] 図B");
  });

  it("changes columns while keeping both gaps, unknown metadata, folding and title", () => {
    expect(changeGridColumns("> > [!grid|lgap=24 vgap=24 cols=2 future=ok cols=5]- 比較", 3))
      .toBe("> > [!grid|cols=3 lgap=24 vgap=24 future=ok]- 比較");
    expect(changeGridColumns("> [!grid]", 1)).toBe("> [!grid|cols=1]");
    expect(() => changeGridColumns("> [!figure] A", 2)).toThrow();
  });
});
