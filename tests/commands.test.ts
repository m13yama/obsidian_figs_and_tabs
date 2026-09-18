import { describe, expect, it } from "vitest";
import { changeGridColumns, wrapCaption, wrapGrid } from "../src/commands";
import type { TextEdit } from "../src/commands";

function apply(source: string, edit: TextEdit): string {
  return source.slice(0, edit.from) + edit.text + source.slice(edit.to);
}

describe("caption commands", () => {
  it("isolates a figure from both surrounding paragraphs", () => {
    const source = "Previous paragraph\n![[image.png]]\nNext paragraph";
    const edit = wrapCaption(source, source.indexOf("![["), source.indexOf("![["), "figure");
    const result = apply(source, edit);
    expect(result).toBe("Previous paragraph\n\n> [!figure] Caption\n> ![[image.png]]\n\nNext paragraph");
    expect(result.slice(edit.anchor, edit.head)).toBe("Caption");
  });

  it("does not consume the next line when selection ends at column zero", () => {
    const source = "| A | B |\n| --- | --- |\n| 1 | 2 |\nBody text";
    const edit = wrapCaption(source, 0, source.indexOf("Body text"), "table");
    expect(apply(source, edit)).toBe("> [!table] Caption\n> | A | B |\n> | --- | --- |\n> | 1 | 2 |\n\nBody text");
  });

  it("preserves the surrounding quote depth inside an existing grid", () => {
    const source = "> [!grid]\n> ![[a.png]]\n> Continued text";
    const edit = wrapCaption(source, source.indexOf("![["), source.indexOf("![["), "figure");
    expect(apply(source, edit)).toBe("> [!grid]\n>\n> > [!figure] Caption\n> > ![[a.png]]\n>\n> Continued text");
  });

  it("provides templates on an empty line and handles reversed selections", () => {
    expect(apply("", wrapCaption("", 0, 0, "table"))).toContain("> | --- | --- |");
    const source = "![[a.png]]";
    expect(wrapCaption(source, source.length, 0, "figure")).toEqual(wrapCaption(source, 0, source.length, "figure"));
  });

  it("rejects rewrapping an existing callout instead of accidentally nesting it", () => {
    const source = "> [!figure] A\n> ![[a.png]]";
    expect(() => wrapCaption(source, 0, source.length, "figure")).toThrow("existing callout");
  });

  it("does not split an existing table when there is no selection", () => {
    const source = "| A | B |\n| --- | --- |\n| 1 | 2 |";
    expect(() => wrapCaption(source, 0, 0, "table")).toThrow("Select the entire table");
  });
});

describe("grid commands", () => {
  const figures = "> [!figure] A\n> ![[a.png]]\n\n> [!table] B\n> | A | B |\n> | --- | --- |";

  it("retains the grid between children and terminates it before the following paragraph", () => {
    const source = figures + "\nBody text";
    expect(apply(source, wrapGrid(source, 0, figures.length, 2, 24, 16)))
      .toBe("> [!grid|cols=2 lgap=24 vgap=16]\n> > [!figure] A\n> > ![[a.png]]\n>\n> > [!table] B\n> > | A | B |\n> > | --- | --- |\n\nBody text");
  });

  it("adds one quote level to nested callouts without escaping their parent", () => {
    const source = figures.split("\n").map(line => line ? `> ${line}` : ">").join("\n");
    const output = apply(source, wrapGrid(source, 0, source.length, 3, 8, 12));
    expect(output).toContain("> > [!grid|cols=3 lgap=8 vgap=12]\n> > > [!figure] A");
    expect(output).toContain("\n> >\n> > > [!table]");
  });

  it("rejects selections containing unquoted text", () => {
    const source = figures + "\n\nText outside the callouts";
    expect(() => wrapGrid(source, 0, source.length, 2, 24, 16)).toThrow("outside the callouts");
    expect(() => wrapGrid("Body text", 0, 2, 2, 24, 16)).toThrow("complete figure or table callouts");
  });

  it("inserts a two-figure template at an empty cursor", () => {
    const output = apply("", wrapGrid("", 0, 0, 2, 24, 16));
    expect(output).toContain("> > [!figure] Figure A");
    expect(output).toContain("\n>\n> > [!figure] Figure B");
  });

  it("changes columns while keeping both gaps, unknown metadata, folding and title", () => {
    expect(changeGridColumns("> > [!grid|lgap=24 vgap=24 cols=2 future=ok cols=5]- Comparison", 3))
      .toBe("> > [!grid|cols=3 lgap=24 vgap=24 future=ok]- Comparison");
    expect(changeGridColumns("> [!grid]", 1)).toBe("> [!grid|cols=1]");
    expect(() => changeGridColumns("> [!figure] A", 2)).toThrow();
  });
});
