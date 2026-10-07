import type { EditorView } from "@codemirror/view";

export interface VideoDimensions {
  width: number;
  height?: number;
}

export interface VideoEmbed {
  index: number;
  dimensions: VideoDimensions | null;
}

const MAX_DIMENSION = 100_000;
const VIDEO_EXTENSION = /\.(?:mp4|webm|ogv|mov|mkv)(?:[?#].*)?$/i;

/** Parse Obsidian's image-style size token, such as `640` or `640x360`. */
export function parseVideoDimensions(token: string): VideoDimensions | null {
  const match = token.trim().match(/^(\d+)(?:\s*[xX×]\s*(\d+))?$/);
  if (!match) return null;
  const width = Number(match[1]);
  const height = match[2] === undefined ? undefined : Number(match[2]);
  if (!isValidDimension(width) || (height !== undefined && !isValidDimension(height))) return null;
  return height === undefined ? { width } : { width, height };
}

/** Keep unsized videos in the result so source order stays aligned with the DOM. */
export function extractVideoEmbeds(markdown: string): VideoEmbed[] {
  const embeds: VideoEmbed[] = [];
  for (const match of markdown.matchAll(/!\[\[([^\]\n]+)\]\]/g)) {
    const body = match[1];
    if (body === undefined || match.index === undefined) continue;
    const parts = body.split("|");
    const path = parts[0]?.trim();
    if (!path || !VIDEO_EXTENSION.test(path)) continue;
    embeds.push({
      index: match.index,
      dimensions: parts.length > 1 ? parseVideoDimensions(parts[parts.length - 1] ?? "") : null,
    });
  }
  return embeds;
}

/** Recover a size that Obsidian retained on a rendered media node or wrapper. */
export function dimensionsFromVideoElement(video: HTMLVideoElement): VideoDimensions | null {
  let element: HTMLElement | null = video;
  for (let depth = 0; element && depth < 5; depth += 1) {
    for (const attribute of ["width", "alt", "title", "src", "data-href", "data-src"]) {
      const value = element.getAttribute(attribute);
      if (!value) continue;
      const token = value.includes("|") ? value.slice(value.lastIndexOf("|") + 1) : value;
      const dimensions = parseVideoDimensions(token);
      if (dimensions) return dimensions;
    }
    if (element.classList.contains("cm-line")) break;
    element = element.parentElement;
  }
  return null;
}

function isValidDimension(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= MAX_DIMENSION;
}

type Dimensions = Map<HTMLVideoElement, VideoDimensions | null>;
type DimensionResolver = () => Dimensions;

/** Restore only the class/style values that are still owned by this plugin. */
class VideoPatch {
  private undo: Array<() => void> = [];

  className(element: Element, name: string): void {
    if (element.classList.contains(name)) return;
    element.classList.add(name);
    this.undo.push(() => {
      if (element.classList.contains(name)) element.classList.remove(name);
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

  restore(): void {
    for (const undo of this.undo.reverse()) undo();
    this.undo = [];
  }
}

interface VideoEntry {
  owners: Map<VideoSizeController, VideoDimensions | null>;
  patch: VideoPatch;
}

/** Coordinate Reading view sections and editor roots without replacing native videos. */
export class VideoSizeRenderer {
  private entries = new Map<HTMLVideoElement, VideoEntry>();
  private controllers = new Set<VideoSizeController>();

  watchMarkdown(root: HTMLElement, markdown: string): VideoSizeController {
    const embeds = extractVideoEmbeds(markdown);
    return this.watch(root, () => dimensionsInSourceOrder(root, embeds));
  }

  watchEditor(view: EditorView): VideoSizeController {
    return this.watch(view.contentDOM, () => dimensionsInEditor(view));
  }

  destroy(): void {
    for (const controller of [...this.controllers]) controller.destroy();
  }

  update(owner: VideoSizeController, previous: Set<HTMLVideoElement>, dimensions: Dimensions): Set<HTMLVideoElement> {
    const current = new Set(dimensions.keys());
    for (const video of previous) {
      if (!current.has(video)) this.release(video, owner);
    }
    for (const [video, size] of dimensions) {
      let entry = this.entries.get(video);
      if (!entry) {
        entry = { owners: new Map(), patch: new VideoPatch() };
        this.entries.set(video, entry);
      }
      entry.owners.set(owner, size);
      this.decorate(video, entry);
    }
    return current;
  }

  release(video: HTMLVideoElement, owner: VideoSizeController): void {
    const entry = this.entries.get(video);
    if (!entry) return;
    entry.owners.delete(owner);
    if (entry.owners.size === 0) {
      entry.patch.restore();
      this.entries.delete(video);
    } else {
      this.decorate(video, entry);
    }
  }

  forget(controller: VideoSizeController): void {
    this.controllers.delete(controller);
  }

  private watch(root: HTMLElement, resolve: DimensionResolver): VideoSizeController {
    const controller = new VideoSizeController(root, resolve, this);
    this.controllers.add(controller);
    controller.refresh();
    return controller;
  }

  private decorate(video: HTMLVideoElement, entry: VideoEntry): void {
    entry.patch.restore();
    const dimensions = [...entry.owners.values()].find(value => value !== null);
    if (!dimensions) return;
    entry.patch.className(video, "ft-video");
    entry.patch.style(video, "--ft-video-width", `${dimensions.width}px`);
    if (dimensions.height !== undefined) {
      entry.patch.className(video, "ft-video-with-ratio");
      entry.patch.style(video, "--ft-video-aspect-ratio", `${dimensions.width} / ${dimensions.height}`);
    }
  }
}

export class VideoSizeController {
  private videos = new Set<HTMLVideoElement>();
  private readonly observer: MutationObserver;
  private queued = false;
  private destroyed = false;

  constructor(
    root: HTMLElement,
    private readonly resolve: DimensionResolver,
    private readonly renderer: VideoSizeRenderer,
  ) {
    const Observer = root.ownerDocument.defaultView?.MutationObserver ?? MutationObserver;
    this.observer = new Observer(() => this.schedule());
    this.observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["alt", "data-href", "data-src", "src", "title", "width"],
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
    if (!this.destroyed) this.videos = this.renderer.update(this, this.videos, this.resolve());
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.observer.disconnect();
    for (const video of this.videos) this.renderer.release(video, this);
    this.videos.clear();
    this.renderer.forget(this);
  }
}

function videosIn(root: HTMLElement): HTMLVideoElement[] {
  const videos = root.matches("video") ? [root as HTMLVideoElement] : [];
  videos.push(...root.querySelectorAll<HTMLVideoElement>("video"));
  return videos;
}

function dimensionsInSourceOrder(root: HTMLElement, embeds: VideoEmbed[]): Dimensions {
  const dimensions: Dimensions = new Map();
  for (const [index, video] of videosIn(root).entries()) {
    dimensions.set(video, embeds[index]?.dimensions ?? dimensionsFromVideoElement(video));
  }
  return dimensions;
}

function dimensionsInEditor(view: EditorView): Dimensions {
  const dimensions: Dimensions = new Map();
  for (const lineElement of view.contentDOM.querySelectorAll<HTMLElement>(".cm-line")) {
    const videos = Array.from(lineElement.querySelectorAll<HTMLVideoElement>("video"));
    if (videos.length === 0) continue;
    try {
      const position = view.posAtDOM(lineElement, 0);
      const embeds = extractVideoEmbeds(view.state.doc.lineAt(position).text);
      for (const [index, video] of videos.entries()) {
        dimensions.set(video, embeds[index]?.dimensions ?? dimensionsFromVideoElement(video));
      }
    } catch {
      // CodeMirror may recycle a line between querying it and resolving its position.
    }
  }
  for (const video of videosIn(view.contentDOM)) {
    if (!dimensions.has(video)) dimensions.set(video, dimensionsFromVideoElement(video));
  }
  return dimensions;
}
