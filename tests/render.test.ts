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
      callout("figure", "Figure <strong>A</strong>", '<p><a href="#note"><img src="a.png"></a></p>') +
      callout("table", "Table B", '<table><tbody><tr><td>42</td></tr></tbody></table>'), "cols=2 lgap=24 vgap=24"));
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
    expect(document.getElementById(table.getAttribute("aria-labelledby")!)?.textContent).toBe("Table B");
  });

  it("clamps column spans and leaves unrelated callouts alone", () => {
    const { root } = setup(callout("grid", "Grid", callout("figure", "A", "image", "span=6"), "cols=2") + callout("note", "Note", "text"));
    expect(root.querySelector<HTMLElement>(".ft-figure")!.style.getPropertyValue("--ft-span")).toBe("2");
    expect(root.querySelector('[data-callout="note"]')?.className).toBe("callout");
  });

  it("mixes bare tables and image paragraphs with captioned callouts without touching prose", () => {
    const { root, controller } = setup(callout("grid", "Grid",
      '<table><tbody><tr><td>27 A</td></tr></tbody></table>' +
      callout("table", "Caption", '<table><tr><td>35 A</td></tr></table>') +
      '<p><a href="note"><img src="a.png"></a></p>' +
      '<p>Explanatory text <img src="inline.png"></p>' +
      '<ul><li><img src="list.png"></li></ul>' +
      callout("note", "Note", '<table><tr><td>Other</td></tr></table>')));
    const content = root.querySelector(".ft-grid > .callout-content")!;
    const table = content.firstElementChild!;
    const image = content.querySelector("p img");
    controller.refresh();
    expect(table.classList.contains("ft-grid-table")).toBe(true);
    expect(content.querySelectorAll(":scope > .ft-grid-item")).toHaveLength(2);
    expect(content.querySelectorAll(".ft-grid-table")).toHaveLength(1);
    expect(table.hasAttribute("aria-labelledby")).toBe(false);
    expect(content.querySelector(".ft-table table")?.hasAttribute("aria-labelledby")).toBe(true);
    expect(content.querySelector("p img")).toBe(image);
    expect(content.querySelectorAll("p")[1]?.className).toBe("");
    expect(content.querySelector("ul")?.className).toBe("");
  });

  it("recognizes native table wrappers and wiki image embeds, and restores all classes on unload", () => {
    const { root, renderer } = setup(callout("grid", "Grid",
      '<div class="table-wrapper"><table><tr><td>27 A</td></tr></table></div>' +
      '<p><span class="internal-embed image-embed"><img src="a.svg"></span></p>'));
    const wrapper = root.querySelector(".table-wrapper")!;
    const image = root.querySelector("p")!;
    expect(wrapper.classList.contains("ft-grid-table")).toBe(true);
    expect(image.classList.contains("ft-grid-figure")).toBe(true);
    renderer.destroy();
    expect(wrapper.className).toBe("table-wrapper");
    expect(image.className).toBe("");
    expect(root.querySelectorAll('[class*="ft-grid"]')).toHaveLength(0);
  });

  it("updates bare items after async rendering and image-only paragraphs becoming prose", async () => {
    const { root } = setup(callout("grid", "Grid", '<p><img src="a.svg"> </p>'));
    const content = root.querySelector(".callout-content")!;
    const paragraph = content.querySelector("p")!;
    expect(paragraph.classList.contains("ft-grid-figure")).toBe(true);
    paragraph.lastChild!.textContent = "Explanatory text";
    content.insertAdjacentHTML("beforeend", "<table><tr><td>27 A</td></tr></table>");
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(paragraph.classList.contains("ft-grid-item")).toBe(false);
    expect(content.querySelector("table")?.classList.contains("ft-grid-table")).toBe(true);
    root.firstElementChild!.setAttribute("data-callout", "note");
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(content.querySelector(".ft-grid-item")).toBeNull();
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

  it("updates horizontal and vertical gaps independently and restores styles on unload", async () => {
    const { root, settings, renderer } = setup(callout("grid", "Grid", "", "lgap=24 vgap=8"));
    const grid = root.firstElementChild as HTMLElement;
    expect(grid.style.getPropertyValue("--ft-lgap")).toBe("24px");
    expect(grid.style.getPropertyValue("--ft-vgap")).toBe("8px");
    settings.lgap = 32;
    settings.vgap = 48;
    grid.setAttribute("data-callout-metadata", "lgap=0");
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(grid.style.getPropertyValue("--ft-lgap")).toBe("0px");
    expect(grid.style.getPropertyValue("--ft-vgap")).toBe("48px");
    renderer.destroy();
    expect(grid.style.getPropertyValue("--ft-lgap")).toBe("");
    expect(grid.style.getPropertyValue("--ft-vgap")).toBe("");
  });

  it("uses loaded image dimensions for intrinsic tracks and restores them on unload", async () => {
    const { root, renderer } = setup(callout("grid", "Grid", '<p><img src="a.svg"></p>'));
    const image = root.querySelector("img")!;
    expect(image.style.getPropertyValue("--ft-image-width")).toBe("");
    Object.defineProperty(image, "naturalWidth", { value: 300, configurable: true });
    image.dispatchEvent(new Event("load"));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(image.style.getPropertyValue("--ft-image-width")).toBe("300px");
    Object.defineProperty(image, "naturalWidth", { value: 640 });
    image.dispatchEvent(new Event("load"));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(image.style.getPropertyValue("--ft-image-width")).toBe("640px");
    renderer.destroy();
    expect(image.style.getPropertyValue("--ft-image-width")).toBe("");
    image.dispatchEvent(new Event("load"));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(image.style.getPropertyValue("--ft-image-width")).toBe("");
  });

  it("handles asynchronously rendered tables and recycled callout types", async () => {
    const { root } = setup(callout("table", "Table A", ""));
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
