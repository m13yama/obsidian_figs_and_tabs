export type CaptionPosition = "top" | "bottom";
export type CalloutKind = "figure" | "table" | "grid";

export interface Settings {
  figureCaption: CaptionPosition;
  tableCaption: CaptionPosition;
  columns: number;
  lgap: number;
  vgap: number;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  figureCaption: "bottom",
  tableCaption: "top",
  columns: 2,
  lgap: 16,
  vgap: 16,
};

export function isKind(value: string | null): value is CalloutKind {
  return value === "figure" || value === "table" || value === "grid";
}

function isPosition(value: unknown): value is CaptionPosition {
  return value === "top" || value === "bottom";
}

function validInteger(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

export function loadSettings(value: unknown): Settings {
  const data = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    figureCaption: isPosition(data.figureCaption) ? data.figureCaption : DEFAULT_SETTINGS.figureCaption,
    tableCaption: isPosition(data.tableCaption) ? data.tableCaption : DEFAULT_SETTINGS.tableCaption,
    columns: validInteger(data.columns, 1, 6) ? data.columns : DEFAULT_SETTINGS.columns,
    lgap: validInteger(data.lgap, 0, 96) ? data.lgap : DEFAULT_SETTINGS.lgap,
    vgap: validInteger(data.vgap, 0, 96) ? data.vgap : DEFAULT_SETTINGS.vgap,
  };
}

export interface CalloutOptions {
  columns: number;
  lgap: number;
  vgap: number;
  span: number;
  caption: CaptionPosition;
}

/** Metadata is a small key=value language; never pass arbitrary text to CSS. */
export function parseOptions(kind: CalloutKind, metadata: string, settings: Settings): CalloutOptions {
  const result: CalloutOptions = {
    columns: settings.columns,
    lgap: settings.lgap,
    vgap: settings.vgap,
    span: 1,
    caption: kind === "table" ? settings.tableCaption : settings.figureCaption,
  };
  for (const token of metadata.trim().split(/\s+/)) {
    const match = /^([a-z]+)=([^=]+)$/.exec(token);
    if (!match) continue;
    const [, key, value] = match;
    if (key === "caption" && kind !== "grid" && isPosition(value)) {
      result.caption = value;
    } else if (value && /^\d+$/.test(value)) {
      const number = Number(value);
      if (kind === "grid" && key === "cols" && validInteger(number, 1, 6)) result.columns = number;
      if (kind === "grid" && key === "lgap" && validInteger(number, 0, 96)) result.lgap = number;
      if (kind === "grid" && key === "vgap" && validInteger(number, 0, 96)) result.vgap = number;
      if (kind !== "grid" && key === "span" && validInteger(number, 1, 6)) result.span = number;
    }
  }
  return result;
}
