import { MarkdownRenderChild, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from "obsidian";
import type { App, Editor } from "obsidian";
import { changeGridColumns, isGridHeader, wrapCaption, wrapGrid } from "./commands";
import type { TextEdit } from "./commands";
import { calloutEditorExtension } from "./editor";
import { DEFAULT_SETTINGS, loadSettings } from "./options";
import type { Settings } from "./options";
import { CalloutRenderer, containsCallouts } from "./render";
import type { CalloutController } from "./render";

class CalloutRenderChild extends MarkdownRenderChild {
  private controller?: CalloutController;

  constructor(element: HTMLElement, private readonly renderer: CalloutRenderer) {
    super(element);
  }

  onload(): void {
    this.controller = this.renderer.watch(this.containerEl);
  }

  onunload(): void {
    this.controller?.destroy();
  }
}

class ColumnsModal extends Modal {
  constructor(app: App, private readonly submit: (columns: number) => void) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText("グリッドの列数");
    for (let columns = 1; columns <= 6; columns++) {
      new Setting(this.contentEl).setName(`${columns}列`).addButton(button => {
        button.setButtonText("適用").onClick(() => {
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
    for (const [key, name] of [["figureCaption", "図のキャプション位置"], ["tableCaption", "表のキャプション位置"]] as const) {
      new Setting(this.containerEl).setName(name)
        .setDesc("caption=top / bottom を指定した図表では、個別の指定を優先します。")
        .addDropdown(dropdown => dropdown.addOption("top", "上").addOption("bottom", "下")
          .setValue(this.plugin.settings[key]).onChange(async value => {
            this.plugin.settings[key] = value === "top" ? "top" : "bottom";
            await this.plugin.saveSettings();
          }));
    }
    new Setting(this.containerEl).setName("既定の列数").setDesc("cols の省略時と、グリッド作成コマンドで使用します。")
      .addDropdown(dropdown => {
        for (let columns = 1; columns <= 6; columns++) dropdown.addOption(String(columns), `${columns}列`);
        dropdown.setValue(String(this.plugin.settings.columns)).onChange(async value => {
          this.plugin.settings.columns = Number(value);
          await this.plugin.saveSettings();
        });
      });
    new Setting(this.containerEl).setName("既定の間隔").setDesc("gap の省略時の間隔（px）。")
      .addSlider(slider => slider.setLimits(0, 96, 1).setValue(this.plugin.settings.gap).setDynamicTooltip()
        .onChange(async value => {
          this.plugin.settings.gap = value;
          await this.plugin.saveSettings();
        }));
  }
}

export default class FiguresAndTablesPlugin extends Plugin {
  settings: Settings = { ...DEFAULT_SETTINGS };
  private renderer!: CalloutRenderer;

  async onload(): Promise<void> {
    this.settings = loadSettings(await this.loadData());
    this.renderer = new CalloutRenderer(() => this.settings);
    this.register(() => this.renderer.destroy());
    this.registerMarkdownPostProcessor((element, context) => {
      if (containsCallouts(element)) context.addChild(new CalloutRenderChild(element, this.renderer));
    }, 100);
    this.registerEditorExtension(calloutEditorExtension(this.renderer));
    this.addSettingTab(new FiguresAndTablesSettingTab(this.app, this));

    for (const [kind, name] of [["figure", "選択範囲を図にする / 図を挿入"], ["table", "選択範囲を表にする / 表を挿入"]] as const) {
      this.addCommand({ id: `insert-${kind}`, name,
        editorCallback: editor => this.edit(editor, (source, from, to) => wrapCaption(source, from, to, kind)),
      });
    }
    this.addCommand({
      id: "wrap-grid",
      name: "選択した図表をグリッドにする / グリッドを挿入",
      editorCallback: editor => this.edit(editor, (source, from, to) => wrapGrid(source, from, to, this.settings.columns, this.settings.gap)),
    });
    this.addCommand({
      id: "change-grid-columns",
      name: "グリッドの列数を変更（先頭行）",
      editorCallback: editor => {
        const lineNumber = editor.getCursor().line;
        const line = editor.getLine(lineNumber);
        if (!isGridHeader(line)) {
          new Notice("[!grid] の先頭行にカーソルを置いてください。");
          return;
        }
        new ColumnsModal(this.app, columns => {
          if (editor.getLine(lineNumber) !== line) {
            new Notice("行が変更されたため、列数の変更を中止しました。もう一度実行してください。");
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
      new Notice(error instanceof Error ? error.message : "図表を作成できませんでした。");
    }
  }
}
