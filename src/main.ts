import { MarkdownRenderChild, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from "obsidian";
import type { App, Editor } from "obsidian";
import { changeGridColumns, isGridHeader, wrapCaption, wrapGrid } from "./commands";
import type { TextEdit } from "./commands";
import { calloutEditorExtension } from "./editor";
import { DEFAULT_SETTINGS, loadSettings } from "./options";
import type { Settings } from "./options";
import { CalloutRenderer, containsCallouts } from "./render";
import type { CalloutController } from "./render";
import { extractVideoEmbeds, VideoSizeRenderer } from "./video";
import type { VideoSizeController } from "./video";

class LayoutRenderChild extends MarkdownRenderChild {
  private calloutController?: CalloutController;
  private videoController?: VideoSizeController;

  constructor(
    element: HTMLElement,
    private readonly calloutRenderer: CalloutRenderer,
    private readonly videoRenderer: VideoSizeRenderer,
    private readonly markdown: string,
  ) {
    super(element);
  }

  onload(): void {
    if (containsCallouts(this.containerEl)) this.calloutController = this.calloutRenderer.watch(this.containerEl);
    if (extractVideoEmbeds(this.markdown).length > 0 || this.containerEl.querySelector("video")) {
      this.videoController = this.videoRenderer.watchMarkdown(this.containerEl, this.markdown);
    }
  }

  onunload(): void {
    this.calloutController?.destroy();
    this.videoController?.destroy();
  }
}

class ColumnsModal extends Modal {
  constructor(app: App, private readonly submit: (columns: number) => void) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText("Grid columns");
    for (let columns = 1; columns <= 6; columns++) {
      new Setting(this.contentEl).setName(`${columns} column${columns === 1 ? "" : "s"}`).addButton(button => {
        button.setButtonText("Apply").onClick(() => {
          this.submit(columns);
          this.close();
        });
      });
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

class FiguresAndTablesSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: FiguresAndTablesPlugin) {
    super(app, plugin);
  }

  display(): void {
    this.containerEl.empty();
    for (const [key, name] of [["figureCaption", "Figure caption position"], ["tableCaption", "Table caption position"]] as const) {
      new Setting(this.containerEl).setName(name)
        .setDesc("Override this for individual figures or tables with caption=top or caption=bottom.")
        .addDropdown(dropdown => dropdown.addOption("top", "Top").addOption("bottom", "Bottom")
          .setValue(this.plugin.settings[key]).onChange(async value => {
            this.plugin.settings[key] = value === "top" ? "top" : "bottom";
            await this.plugin.saveSettings();
          }));
    }
    new Setting(this.containerEl).setName("Default columns").setDesc("Used when cols is omitted and when creating a grid.")
      .addDropdown(dropdown => {
        for (let columns = 1; columns <= 6; columns++) dropdown.addOption(String(columns), `${columns} column${columns === 1 ? "" : "s"}`);
        dropdown.setValue(String(this.plugin.settings.columns)).onChange(async value => {
          this.plugin.settings.columns = Number(value);
          await this.plugin.saveSettings();
        });
      });
    for (const [key, name] of [["lgap", "Default horizontal spacing"], ["vgap", "Default vertical spacing"]] as const) {
      new Setting(this.containerEl).setName(name).setDesc(`Spacing in pixels when ${key} is omitted.`)
        .addSlider(slider => slider.setLimits(0, 96, 1).setValue(this.plugin.settings[key]).setDynamicTooltip()
          .onChange(async value => {
            this.plugin.settings[key] = value;
            await this.plugin.saveSettings();
          }));
    }
  }
}

export default class FiguresAndTablesPlugin extends Plugin {
  settings: Settings = { ...DEFAULT_SETTINGS };
  private renderer!: CalloutRenderer;
  private videoRenderer!: VideoSizeRenderer;

  async onload(): Promise<void> {
    this.settings = loadSettings(await this.loadData());
    this.renderer = new CalloutRenderer(() => this.settings);
    this.videoRenderer = new VideoSizeRenderer();
    this.register(() => this.renderer.destroy());
    this.register(() => this.videoRenderer.destroy());
    this.registerMarkdownPostProcessor((element, context) => {
      const markdown = context.getSectionInfo(element)?.text ?? "";
      if (containsCallouts(element) || extractVideoEmbeds(markdown).length > 0 || element.querySelector("video")) {
        context.addChild(new LayoutRenderChild(element, this.renderer, this.videoRenderer, markdown));
      }
    }, 100);
    this.registerEditorExtension(calloutEditorExtension(this.renderer, this.videoRenderer));
    this.addSettingTab(new FiguresAndTablesSettingTab(this.app, this));

    for (const [kind, name] of [["figure", "Insert figure / wrap selection"], ["table", "Insert table / wrap selection"]] as const) {
      this.addCommand({ id: `insert-${kind}`, name,
        editorCallback: editor => this.edit(editor, (source, from, to) => wrapCaption(source, from, to, kind)),
      });
    }
    this.addCommand({
      id: "wrap-grid",
      name: "Insert grid / wrap selected figures and tables",
      editorCallback: editor => this.edit(editor, (source, from, to) => wrapGrid(source, from, to, this.settings.columns, this.settings.lgap, this.settings.vgap)),
    });
    this.addCommand({
      id: "change-grid-columns",
      name: "Change grid columns (from the header)",
      editorCallback: editor => {
        const lineNumber = editor.getCursor().line;
        const line = editor.getLine(lineNumber);
        if (!isGridHeader(line)) {
          new Notice("Place the cursor on the [!grid] header.");
          return;
        }
        new ColumnsModal(this.app, columns => {
          if (editor.getLine(lineNumber) !== line) {
            new Notice("The line changed, so the column update was canceled. Run the command again.");
            return;
          }
          editor.replaceRange(changeGridColumns(line, columns), { line: lineNumber, ch: 0 }, { line: lineNumber, ch: line.length });
        }).open();
      },
    });

    // Also apply when enabling the plugin while a note is already in reading mode.
    this.app.workspace.onLayoutReady(() => {
      this.app.workspace.iterateAllLeaves(leaf => {
        if (leaf.view instanceof MarkdownView) leaf.view.previewMode.rerender(true);
      });
    });
  }

  async saveSettings(): Promise<void> {
    this.renderer.refreshAll();
    await this.saveData(this.settings);
  }

  private edit(editor: Editor, transform: (source: string, from: number, to: number) => TextEdit): void {
    try {
      const edit = transform(editor.getValue(), editor.posToOffset(editor.getCursor("from")), editor.posToOffset(editor.getCursor("to")));
      // A single transaction makes wrapping reversible with one Undo.
      editor.transaction({ changes: [{ from: editor.offsetToPos(edit.from), to: editor.offsetToPos(edit.to), text: edit.text }] });
      editor.setSelection(editor.offsetToPos(edit.anchor), editor.offsetToPos(edit.head));
    } catch (error) {
      new Notice(error instanceof Error ? error.message : "Could not create the figure or table.");
    }
  }
}
