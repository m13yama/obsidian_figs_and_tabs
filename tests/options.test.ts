import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, loadSettings, parseOptions } from "../src/options";

describe("callout options", () => {
  it("keeps captions below figures and above tables by default", () => {
    expect(parseOptions("figure", "", DEFAULT_SETTINGS).caption).toBe("bottom");
    expect(parseOptions("table", "", DEFAULT_SETTINGS).caption).toBe("top");
  });

  it("accepts the documented layout syntax and independent caption overrides", () => {
    expect(parseOptions("grid", "cols=3 gap=0", DEFAULT_SETTINGS)).toMatchObject({ columns: 3, gap: 0 });
    expect(parseOptions("figure", "span=2 caption=top", DEFAULT_SETTINGS)).toMatchObject({ span: 2, caption: "top" });
  });

  it("falls back per invalid option and never passes CSS from metadata through", () => {
    expect(parseOptions("grid", "cols=999 gap=24 unknown=ok", DEFAULT_SETTINGS)).toMatchObject({ columns: 2, gap: 24 });
    for (const metadata of ["cols=2.5 gap=-1", "cols=NaN gap=Infinity", "cols=2;display:none gap=calc(2px)", "cols= gap=97"]) {
      expect(parseOptions("grid", metadata, DEFAULT_SETTINGS)).toMatchObject({ columns: 2, gap: 16 });
    }
  });

  it("validates persisted settings and ignores unknown fields", () => {
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings({ columns: "3", gap: -20, figureCaption: "left" })).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings({ columns: 4, gap: 0, tableCaption: "bottom", extra: true }))
      .toEqual({ ...DEFAULT_SETTINGS, columns: 4, gap: 0, tableCaption: "bottom" });
  });
});
