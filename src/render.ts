import { isKind, parseOptions } from "./options";
import type { Settings } from "./options";

const CALLOUT = '.callout[data-callout="figure"], .callout[data-callout="table"], .callout[data-callout="grid"]';
let nextCaptionId = 0;

/** Restore only values that still belong to us, preserving changes by other plugins. */
class Patch {
  private undo: Array<() => void> = [];

  attribute(element: Element, name: string, value: string): void {
    const old = element.getAttribute(name);
    if (old === value) return;
    element.setAttribute(name, value);
    this.undo.push(() => {
      if (element.getAttribute(name) !== value) return;
      if (old === null) element.removeAttribute(name);
      else element.setAttribute(name, old);
    });
  }

  style(element: HTMLElement, name: string, value: string): void {
    const old = element.style.getPropertyValue(name);
    const priority = element.style.getPropertyPriority(name);
    if (old === value && !priority) return;
    element.style.setProperty(name, value);
    this.undo.push(() => {
      if (element.style.getPropertyValue(name) !== value) return;
      if (old) element.style.setProperty(name, old, priority);
      else element.style.removeProperty(name);
    });
  }

  className(element: Element, name: string): void {
    if (element.classList.contains(name)) return;
    element.classList.add(name);
    this.undo.push(() => element.classList.remove(name));
  }

  restore(): void {
    for (const undo of this.undo.reverse()) undo();
    this.undo = [];
  }
}

interface Entry {
  owners: Set<CalloutController>;
  patch: Patch;
  captionId: string;
}

/** Shared by reading sections and editor views: overlapping roots decorate a node once. */
export class CalloutRenderer {
  private entries = new Map<HTMLElement, Entry>();
  private controllers = new Set<CalloutController>();

  constructor(private readonly settings: () => Settings) {}

  watch(root: HTMLElement): CalloutController {
    const controller = new CalloutController(root, this);
    this.controllers.add(controller);
    controller.refresh();
    return controller;
  }

  refreshAll(): void {
    for (const controller of this.controllers) controller.refresh();
  }

  destroy(): void {
    for (const controller of [...this.controllers]) controller.destroy();
  }

  forget(controller: CalloutController): void {
    this.controllers.delete(controller);
  }

  update(root: HTMLElement, owner: CalloutController, previous: Set<HTMLElement>): Set<HTMLElement> {
    const current = new Set<HTMLElement>();
    if (root.matches(CALLOUT)) current.add(root);
    for (const element of root.querySelectorAll<HTMLElement>(CALLOUT)) current.add(element);

    for (const element of previous) {
      if (!current.has(element)) this.release(element, owner);
    }
    for (const element of current) {
      let entry = this.entries.get(element);
      if (!entry) {
        let captionId: string;
        do {
          captionId = `ft-caption-${++nextCaptionId}`;
        } while (element.ownerDocument.getElementById(captionId));
        entry = { owners: new Set(), patch: new Patch(), captionId };
        this.entries.set(element, entry);
      }
      entry.owners.add(owner);
      this.decorate(element, entry);
    }
    return current;
  }

  release(element: HTMLElement, owner: CalloutController): void {
    const entry = this.entries.get(element);
    if (!entry) return;
    entry.owners.delete(owner);
    if (entry.owners.size === 0) {
      entry.patch.restore();
      this.entries.delete(element);
    }
  }

  private decorate(element: HTMLElement, entry: Entry): void {
    const { patch } = entry;
    patch.restore();
    const kind = element.getAttribute("data-callout");
    if (!isKind(kind)) return;
    const settings = this.settings();
    const options = parseOptions(kind, element.getAttribute("data-callout-metadata") ?? "", settings);
    patch.className(element, "ft-callout");
    patch.className(element, `ft-${kind}`);

    if (kind === "grid") {
      patch.style(element, "--ft-columns", String(options.columns));
      patch.style(element, "--ft-gap", `${options.gap}px`);
      return;
    }

    const parent = element.parentElement;
    const grid = parent?.classList.contains("callout-content") ? parent.parentElement : null;
    const columns = grid?.getAttribute("data-callout") === "grid"
      ? parseOptions("grid", grid.getAttribute("data-callout-metadata") ?? "", settings).columns : 1;
    patch.style(element, "--ft-span", String(Math.min(options.span, columns)));
    patch.attribute(element, "data-ft-caption", options.caption);

    const title = element.querySelector<HTMLElement>(":scope > .callout-title > .callout-title-inner");
    if (!title) return;
    if (!title.id) patch.attribute(title, "id", entry.captionId);
    if (kind === "figure") {
      // ARIA preserves Obsidian's original nodes and their edit/link handlers.
      if (!element.hasAttribute("role")) patch.attribute(element, "role", "figure");
      this.label(patch, element, title.id);
    } else {
      for (const table of element.querySelectorAll("table")) {
        if (table.closest(".callout") === element && !table.querySelector(":scope > caption")) {
          this.label(patch, table, title.id);
        }
      }
    }
  }

  private label(patch: Patch, element: Element, id: string): void {
    const ids = (element.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean);
    if (!ids.includes(id)) ids.push(id);
    patch.attribute(element, "aria-labelledby", ids.join(" "));
  }
}

export class CalloutController {
  private elements = new Set<HTMLElement>();
  private observer: MutationObserver;
  private queued = false;
  private destroyed = false;

  constructor(private readonly root: HTMLElement, private readonly renderer: CalloutRenderer) {
    const Observer = root.ownerDocument.defaultView?.MutationObserver ?? MutationObserver;
    this.observer = new Observer(() => this.schedule());
    // Native widgets may finish rendering later or be recycled on edit/scroll.
    // Our own classes, styles and ARIA attributes deliberately aren't observed.
    this.observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-callout", "data-callout-metadata"],
    });
  }

  schedule(): void {
    if (this.queued || this.destroyed) return;
    this.queued = true;
    queueMicrotask(() => {
      this.queued = false;
      this.refresh();
    });
  }

  refresh(): void {
    if (!this.destroyed) this.elements = this.renderer.update(this.root, this, this.elements);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.observer.disconnect();
    for (const element of this.elements) this.renderer.release(element, this);
    this.elements.clear();
    this.renderer.forget(this);
  }
}

export function containsCallouts(root: HTMLElement): boolean {
  return root.matches(CALLOUT) || root.querySelector(CALLOUT) !== null;
}
