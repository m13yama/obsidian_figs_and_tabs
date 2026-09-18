import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, loadSettings, parseOptions } from "../src/options";

describe("callout options", () => {
  it("keeps captions below figures and above tables by default", () => {
    expect(parseOptions("figure", "", DEFAULT_SETTINGS).caption).toBe("bottom");
    expect(parseOptions("table", "", DEFAULT_SETTINGS).caption).toBe("top");
  });

  it("accepts the documented layout syntax and independent caption overrides", () => {
    expect(parseOptions("grid", "cols=3 lgap=24 vgap=0", DEFAULT_SETTINGS)).toMatchObject({ columns: 3, lgap: 24, vgap: 0 });
    expect(parseOptions("grid", "lgap=0 vgap=96", DEFAULT_SETTINGS)).toMatchObject({ lgap: 0, vgap: 96 });
    expect(parseOptions("figure", "span=2 caption=top", DEFAULT_SETTINGS)).toMatchObject({ span: 2, caption: "top" });
  });

  it("falls back per invalid option and never passes CSS from metadata through", () => {
    expect(parseOptions("grid", "cols=999 lgap=24 vgap=-1 unknown=ok", DEFAULT_SETTINGS)).toMatchObject({ columns: 2, lgap: 24, vgap: 16 });
    for (const metadata of ["cols=2.5 lgap=-1 vgap=2.5", "cols=NaN lgap=Infinity vgap=NaN", "cols=2;display:none lgap=calc(2px)", "cols= lgap=97 vgap=97"]) {
      expect(parseOptions("grid", metadata, DEFAULT_SETTINGS)).toMatchObject({ columns: 2, lgap: 16, vgap: 16 });
    }
  });

  it("validates persisted settings and ignores unknown fields", () => {
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings({ columns: "3", lgap: -20, vgap: 100, figureCaption: "left" })).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings({ columns: 4, lgap: 0, vgap: 32, tableCaption: "bottom", extra: true }))
      .toEqual({ ...DEFAULT_SETTINGS, columns: 4, lgap: 0, vgap: 32, tableCaption: "bottom" });
  });

  it("ignores the retired gap option and setting without migrating it", () => {
    const settings = { ...DEFAULT_SETTINGS, lgap: 12, vgap: 24 };
    expect(parseOptions("grid", "gap=80", settings)).toMatchObject({ lgap: 12, vgap: 24 });
    expect(loadSettings({ gap: 80 })).toEqual(DEFAULT_SETTINGS);
  });
});
