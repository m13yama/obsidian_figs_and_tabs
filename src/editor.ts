import { ViewPlugin } from "@codemirror/view";
import type { EditorView, ViewUpdate } from "@codemirror/view";
import type { CalloutController, CalloutRenderer } from "./render";
import { calloutSourceStyles } from "./source";

/** Style native callout widgets; never replace editor text or table widgets. */
export function calloutEditorExtension(renderer: CalloutRenderer) {
  return [calloutSourceStyles, ViewPlugin.fromClass(class {
    private readonly controller: CalloutController;

    constructor(view: EditorView) {
      this.controller = renderer.watch(view.contentDOM);
    }

    update(update: ViewUpdate): void {
      if (update.docChanged || update.viewportChanged) this.controller.schedule();
    }

    destroy(): void {
      this.controller.destroy();
    }
  })];
}
