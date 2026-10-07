import { ViewPlugin } from "@codemirror/view";
import type { EditorView, ViewUpdate } from "@codemirror/view";
import type { CalloutController, CalloutRenderer } from "./render";
import { calloutSourceStyles } from "./source";
import type { VideoSizeController, VideoSizeRenderer } from "./video";

/** Style native callout widgets; never replace editor text or table widgets. */
export function calloutEditorExtension(renderer: CalloutRenderer, videoRenderer: VideoSizeRenderer) {
  return [calloutSourceStyles, ViewPlugin.fromClass(class {
    private readonly controller: CalloutController;
    private readonly videoController: VideoSizeController;

    constructor(view: EditorView) {
      this.controller = renderer.watch(view.contentDOM);
      this.videoController = videoRenderer.watchEditor(view);
    }

    update(update: ViewUpdate): void {
      if (update.docChanged || update.viewportChanged || update.geometryChanged) {
        this.controller.schedule();
        this.videoController.schedule();
      }
    }

    destroy(): void {
      this.controller.destroy();
      this.videoController.destroy();
    }
  })];
}
