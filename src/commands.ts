export interface TextEdit {
  from: number;
  to: number;
  text: string;
  anchor: number;
  head: number;
}

interface QuoteLine {
  depth: number;
  text: string;
}

function readQuote(line: string): QuoteLine {
  let depth = 0;
  let rest = line;
  for (;;) {
    const match = /^ {0,3}>[ \t]?/.exec(rest);
    if (!match) return { depth, text: rest };
    depth++;
    rest = rest.slice(match[0].length);
  }
}

function quote(depth: number, text = ""): string {
  return text ? `${"> ".repeat(depth)}${text}` : "> ".repeat(depth).trimEnd();
}

function linesRange(source: string, anchor: number, head: number) {
  const start = Math.min(anchor, head);
  let end = Math.max(anchor, head);
  if (end > start && source[end - 1] === "\n") end--;
  const from = start === 0 ? 0 : source.lastIndexOf("\n", start - 1) + 1;
  const newline = source.indexOf("\n", end);
  const to = newline < 0 ? source.length : newline;
  return { from, to, lines: source.slice(from, to).split("\n") };
}

function isSeparator(line: string, depth: number): boolean {
  const parsed = readQuote(line);
  return parsed.depth === depth && parsed.text.trim() === "";
}

/** Ensure the new callout cannot merge with adjacent paragraphs or callouts. */
function isolatedEdit(source: string, from: number, to: number, block: string, depth: number, cursor: number, length: number): TextEdit {
  const before = source.slice(0, Math.max(0, from - 1)).split("\n").pop() ?? "";
  const after = source.slice(to + 1).split("\n")[0] ?? "";
  const prefix = from > 0 && !isSeparator(before, depth) ? `${quote(depth)}\n` : "";
  const suffix = to < source.length && !isSeparator(after, depth) ? `\n${quote(depth)}` : "";
  return {
    from, to,
    text: prefix + block + suffix,
    anchor: from + prefix.length + cursor,
    head: from + prefix.length + cursor + length,
  };
}

const CAPTION = "キャプション";

/** Operates on complete lines, including when selection ends at the next line's start. */
export function wrapCaption(source: string, anchor: number, head: number, kind: "figure" | "table"): TextEdit {
  const { from, to, lines } = linesRange(source, anchor, head);
  const meaningful = lines.filter(line => readQuote(line).text.trim());
  if (kind === "table" && anchor === head && meaningful.length > 0) {
    throw new Error("表全体を選択してください。空行で実行すると表のひな形を挿入します。");
  }
  const depth = meaningful.length ? Math.min(...meaningful.map(line => readQuote(line).depth)) : readQuote(lines[0] ?? "").depth;
  const body = lines.map(line => {
    let rest = line;
    for (let i = 0; i < depth; i++) rest = rest.replace(/^ {0,3}>[ \t]?/, "");
    return rest;
  });
  if (body.some(line => /^\s*\[![^\]]+\]/.test(line))) {
    throw new Error("既存のcallout全体ではなく、画像または表の本文を選択してください。");
  }
  const template = kind === "figure" ? ["![[画像.png]]"] : ["| 項目 | 値 |", "| --- | --- |", "| A | 1 |"];
  const header = quote(depth + 1, `[!${kind}] ${CAPTION}`);
  const content = meaningful.length ? body : template;
  const block = [header, ...content.map(line => quote(depth + 1, line))].join("\n");
  return isolatedEdit(source, from, to, block, depth, header.indexOf(CAPTION), CAPTION.length);
}

export function wrapGrid(source: string, anchor: number, head: number, columns: number, gap: number): TextEdit {
  const { from, to, lines } = linesRange(source, anchor, head);
  const first = lines.find(line => readQuote(line).text.trim()) ?? "";
  let depth: number;
  let children: string[];
  if (!first) {
    depth = readQuote(lines[0] ?? "").depth;
    children = ["> [!figure] 図A", "> ![[画像A.png]]", "", "> [!figure] 図B", "> ![[画像B.png]]"];
  } else {
    const firstQuote = readQuote(first);
    if (anchor === head || firstQuote.depth < 1 || !/^\[!(figure|table)(?:\|[^\]]*)?\]/i.test(firstQuote.text)) {
      throw new Error("図・表のcallout全体を選択してください。空行で実行するとひな形を挿入します。");
    }
    depth = firstQuote.depth - 1;
    children = lines.map(line => {
      const parsed = readQuote(line);
      if (parsed.text.trim() && parsed.depth <= depth) {
        throw new Error("選択範囲にcalloutの外の本文が含まれています。図・表だけを選択してください。");
      }
      let rest = line;
      for (let i = 0; i < depth; i++) rest = rest.replace(/^ {0,3}>[ \t]?/, "");
      return rest;
    });
  }
  const header = quote(depth + 1, `[!grid|cols=${columns} gap=${gap}]`);
  const block = [header, ...children.map(line => quote(depth + 1, line))].join("\n");
  return isolatedEdit(source, from, to, block, depth, header.length, 0);
}

const GRID_HEADER = /^((?: {0,3}>[ \t]?)+)\[!grid(?:\|([^\]]*))?\]([+-]?)(.*)$/i;

export function isGridHeader(line: string): boolean {
  return GRID_HEADER.test(line);
}

export function changeGridColumns(line: string, columns: number): string {
  const match = GRID_HEADER.exec(line);
  if (!match || !Number.isInteger(columns) || columns < 1 || columns > 6) {
    throw new Error("グリッドの先頭行にカーソルを置いてください（列数は1〜6）。");
  }
  const [, prefix, metadata = "", folding, title] = match;
  const tokens = metadata.split(/\s+/).filter(token => token && !/^cols=/.test(token));
  return `${prefix}[!grid|${[`cols=${columns}`, ...tokens].join(" ")}]${folding}${title}`;
}
