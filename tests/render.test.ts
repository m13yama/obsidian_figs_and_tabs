import { afterEach, describe, expect, it } from "vitest";
import { CalloutRenderer } from "../src/render";
import { DEFAULT_SETTINGS } from "../src/options";
import type { Settings } from "../src/options";

function callout(kind: string, title: string, content: string, metadata = ""): string {
  return `<div class="callout" data-callout="${kind}" data-callout-metadata="${metadata}"><div class="callout-title"><div class="callout-icon"></div><div class="callout-title-inner">${title}</div></div><div class="callout-content">${content}</div></div>`;
}

const renderers: CalloutRenderer[] = [];
function setup(html: string) {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.append(root);
  const settings: Settings = { ...DEFAULT_SETTINGS };
  const renderer = new CalloutRenderer(() => settings);
  renderers.push(renderer);
  const controller = renderer.watch(root);
  return { root, renderer, controller, settings };
}

afterEach(() => {
  for (const renderer of renderers.splice(0)) renderer.destroy();
  document.body.replaceChildren();
});

describe("native callout decoration", () => {
  it("keeps image/link/table nodes and handlers intact while associating captions", () => {
    const { root, controller } = setup(callout("grid", "Grid",
      callout("figure", "図 <strong>A</strong>", '<p><a href="#note"><img src="a.png"></a></p>') +
      callout("table", "表 B", '<table><tbody><tr><td>42</td></tr></tbody></table>'), "cols=2 gap=24"));
    const image = root.querySelector("img");
    const cell = root.querySelector("td");
    let clicked = false;
    cell!.addEventListener("click", () => clicked = true);
    controller.refresh();
    controller.refresh();
    expect(root.querySelector("img")).toBe(image);
    expect(root.querySelector("td")).toBe(cell);
    cell!.click();
    expect(clicked).toBe(true);
    expect(root.querySelectorAll(".callout-title-inner")).toHaveLength(3);
    expect(root.querySelector(".ft-figure")?.getAttribute("role")).toBe("figure");
    const table = root.querySelector("table")!;
    expect(document.getElementById(table.getAttribute("aria-labelledby")!)?.textContent).toBe("表 B");
  });

  it("clamps column spans and leaves unrelated callouts alone", () => {
    const { root } = setup(callout("grid", "Grid", callout("figure", "A", "image", "span=6"), "cols=2") + callout("note", "Note", "text"));
    expect(root.querySelector<HTMLElement>(".ft-figure")!.style.getPropertyValue("--ft-span")).toBe("2");
    expect(root.querySelector('[data-callout="note"]')?.className).toBe("callout");
  });

  it("applies edited metadata and settings without rebuilding content", async () => {
    const { root, settings, renderer } = setup(callout("figure", "A", "image"));
    const figure = root.firstElementChild!;
    expect(figure.getAttribute("data-ft-caption")).toBe("bottom");
    settings.figureCaption = "top";
    renderer.refreshAll();
    expect(figure.getAttribute("data-ft-caption")).toBe("top");
    figure.setAttribute("data-callout-metadata", "caption=bottom");
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(figure.getAttribute("data-ft-caption")).toBe("bottom");
  });

  it("handles asynchronously rendered tables and recycled callout types", async () => {
    const { root } = setup(callout("table", "表 A", ""));
    const element = root.firstElementChild!;
    element.querySelector(".callout-content")!.innerHTML = "<table><tr><td>A</td></tr></table>";
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(root.querySelector("table")?.hasAttribute("aria-labelledby")).toBe(true);
    element.setAttribute("data-callout", "note");
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(element.classList.contains("ft-callout")).toBe(false);
    expect(root.querySelector("table")?.hasAttribute("aria-labelledby")).toBe(false);
  });

  it("retains decorations until all overlapping reading/editor controllers release them", () => {
    const { root, renderer, controller } = setup(callout("figure", "A", "image"));
    const figure = root.firstElementChild as HTMLElement;
    const second = renderer.watch(figure);
    controller.destroy();
    expect(figure.classList.contains("ft-figure")).toBe(true);
    second.destroy();
    expect(figure.className).toBe("callout");
    expect(figure.getAttribute("role")).toBeNull();
    expect(figure.querySelector(".callout-title-inner")?.id).toBe("");
  });

  it("restores pre-existing accessibility attributes when disabled", () => {
    const { root, renderer, controller } = setup(callout("figure", "A", "image"));
    controller.destroy();
    const figure = root.firstElementChild!;
    figure.setAttribute("role", "group");
    figure.setAttribute("aria-labelledby", "external-label");
    const title = figure.querySelector(".callout-title-inner")!;
    title.id = "existing-caption";
    renderer.watch(root);
    expect(figure.getAttribute("aria-labelledby")).toBe("external-label existing-caption");
    renderer.destroy();
    expect(figure.getAttribute("role")).toBe("group");
    expect(figure.getAttribute("aria-labelledby")).toBe("external-label");
    expect(title.id).toBe("existing-caption");
  });
});
