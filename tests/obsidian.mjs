import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { chromium } from "playwright";

// An actual Obsidian smoke test. Always use a disposable vault and profile.
// Build first. OBSIDIAN_BIN can override the executable for your installation.
let endpoint = process.env.OBSIDIAN_TEST_CDP;
let vault = process.env.OBSIDIAN_TEST_VAULT;
let child;
let browser;
let launchLog = "";
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

try {
  if (!endpoint) {
    const root = await mkdtemp(join(tmpdir(), "figures-and-tables-obsidian-"));
    const profile = join(root, "profile");
    vault = join(root, "vault");
    await mkdir(profile, { recursive: true });
    await mkdir(join(vault, ".obsidian/plugins"), { recursive: true });
    await cp("dist/figures-and-tables", join(vault, ".obsidian/plugins/figures-and-tables"), { recursive: true });
    await cp("examples", vault, { recursive: true });
    await writeFile(join(profile, "obsidian.json"), JSON.stringify({
      vaults: { f16a7ab1e5000001: { path: vault, ts: Date.now(), open: true } }, updateDisabled: true,
    }));
    await writeFile(join(vault, ".obsidian/community-plugins.json"), JSON.stringify(["figures-and-tables"]));
    await writeFile(join(vault, ".obsidian/app.json"), JSON.stringify({ livePreview: true, readableLineLength: false }));
    child = spawn(process.env.OBSIDIAN_BIN ?? "/opt/Obsidian/obsidian", [
      `--user-data-dir=${profile}`, "--remote-debugging-port=0", "--no-sandbox", "--disable-gpu", "--no-first-run",
    ], { env: { ...process.env, XDG_CONFIG_HOME: join(root, "config") }, stdio: ["ignore", "pipe", "pipe"] });
    child.on("error", error => launchLog += error.message);
    child.stdout.on("data", data => launchLog += data);
    child.stderr.on("data", data => launchLog += data);
    for (let attempt = 0; attempt < 100; attempt++) {
      endpoint = /DevTools listening on (ws:\/\/\S+)/.exec(launchLog)?.[1];
      if (endpoint) break;
      if (child.exitCode !== null) throw new Error(launchLog);
      await pause(200);
    }
    if (!endpoint) throw new Error(`Obsidian did not start: ${launchLog}`);
  }
  assert(vault?.includes("figures-and-tables-obsidian-"), "Only use a disposable test vault");
  browser = await chromium.connectOverCDP(endpoint);
  const context = browser.contexts()[0];
  const page = context.pages()[0] ?? await context.waitForEvent("page");
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.waitForFunction(() => !!window.app?.vault?.adapter?.basePath);
  assert.equal(await page.evaluate(() => app.vault.adapter.basePath), vault, "Wrong vault; refusing to edit");
  await page.waitForFunction(() => window.app.workspace.layoutReady);
  const trust = page.getByRole("button", { name: "Trust author and enable plugins" });
  if (await trust.count()) await trust.click();
  await page.evaluate(async () => { await app.plugins.enablePlugin("figures-and-tables"); });

  const source = [
    "> [!grid|cols=2 gap=16]",
    "> > [!figure] 図A **装置**",
    "> > ![[example-apparatus.svg]]",
    ">",
    "> > [!table] 表B 測定条件",
    "> > | 項目 | 値 |",
    "> > | --- | --- |",
    "> > | 温度 | 25℃ |",
    "> > | 識別子 | ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 |",
    ">",
    "> > [!figure|span=2] 図C 結果",
    "> > ![[example-results.svg]]",
    "", "グリッド外の本文", "",
    "> [!figure|caption=top] 図D 独立した図",
    "> ![[example-apparatus.svg]]", "", "編集位置",
  ].join("\n");
  await page.evaluate(async source => {
    const existing = app.vault.getAbstractFileByPath("smoke.md");
    const file = existing ?? await app.vault.create("smoke.md", source);
    if (existing) await app.vault.modify(existing, source);
    await app.workspace.getLeaf(false).openFile(file, { state: { mode: "preview" } });
  }, source);
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.locator(".markdown-preview-view .ft-grid").waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll(".markdown-preview-view .ft-grid img")].every(img => img.naturalWidth > 0));

  async function layout(mode) {
    return page.evaluate(mode => {
      const root = document.querySelector(mode === "reading" ? ".markdown-preview-view" : ".markdown-source-view");
      const grid = root.querySelector(".ft-grid");
      const content = grid.querySelector(":scope > .callout-content");
      const items = [...content.querySelectorAll(":scope > .ft-callout")];
      const box = element => {
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x, y, width, height };
      };
      return {
        columns: getComputedStyle(content).gridTemplateColumns.split(" ").length,
        viewportWidth: content.clientWidth,
        contentWidth: content.scrollWidth,
        grid: box(grid), items: items.map(box),
        captions: items.map(item => ({
          title: box(item.querySelector(":scope > .callout-title")),
          content: box(item.querySelector(":scope > .callout-content")),
        })),
        outside: [...root.querySelectorAll("p, .cm-line")].find(p => p.textContent === "グリッド外の本文")?.closest(".ft-grid") === null,
        standalone: [...root.querySelectorAll(".ft-figure")].filter(e => !e.parentElement.closest(".ft-grid")).length,
        captionCount: grid.querySelectorAll(".callout-title-inner").length,
      };
    }, mode);
  }

  async function checkHorizontalScroll(mode) {
    const narrow = await layout(mode);
    assert.equal(narrow.columns, 2, "Narrow panes retain the configured columns");
    assert(Math.abs(narrow.items[0].y - narrow.items[1].y) < 1, "Figure and table stay on the same row");
    assert(narrow.contentWidth > narrow.viewportWidth, "The grid overflows horizontally");
    assert(narrow.items[2].width > narrow.viewportWidth, "Column spans are retained");
    assert(await page.evaluate(mode => {
      const root = document.querySelector(mode === "reading" ? ".markdown-preview-view" : ".markdown-source-view");
      const content = root.querySelector(".ft-grid > .callout-content");
      content.scrollLeft = content.scrollWidth;
      const scrolled = content.scrollLeft > 0;
      content.scrollLeft = 0;
      return scrolled && getComputedStyle(content).overflowX === "auto";
    }, mode), "The grid itself can be scrolled horizontally");
  }
  const wide = await layout("reading");
  assert.equal(wide.columns, 2);
  assert.equal(wide.items.length, 3);
  assert(Math.abs(wide.items[0].y - wide.items[1].y) < 1, "Figure and table share a row");
  assert(wide.items[2].y > wide.items[0].y, "Spanning figure occupies the next row");
  assert(Math.abs(wide.items[2].width - wide.grid.width) < 1, "span=2 fills the grid");
  assert(wide.captions[0].title.y >= wide.captions[0].content.y + wide.captions[0].content.height, "Figure caption is below");
  assert(wide.captions[1].title.y < wide.captions[1].content.y, "Table caption is above");
  assert(wide.outside && wide.standalone === 1, "Blank line ends the grid");
  assert.equal(wide.captionCount, 4, "One native title per callout, including hidden grid title");
  assert(await page.evaluate(() => {
    const content = document.querySelector(".markdown-preview-view .ft-table > .callout-content");
    return content.scrollWidth > content.clientWidth && getComputedStyle(content).overflowX === "auto";
  }), "Wide tables scroll within their cell");
  await mkdir("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/reading.png" });

  await page.setViewportSize({ width: 800, height: 1000 });
  await page.waitForFunction(() => {
    const content = document.querySelector(".markdown-preview-view .ft-grid > .callout-content");
    return content.scrollWidth > content.clientWidth;
  });
  await checkHorizontalScroll("reading");
  await page.screenshot({ path: "test-results/narrow.png" });

  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.evaluate(async () => {
    const leaf = app.workspace.activeLeaf;
    await leaf.setViewState({ type: "markdown", state: { file: "smoke.md", mode: "source", source: false } });
    leaf.view.editor.setCursor({ line: leaf.view.editor.lineCount() - 1, ch: 0 });
  });
  await page.locator(".markdown-source-view .ft-grid").waitFor();
  const live = await layout("live");
  assert.equal(live.columns, 2);
  assert.equal(live.items.length, 3);
  assert(live.outside && live.standalone === 1);
  assert.equal(await page.evaluate(() => app.workspace.activeLeaf.view.editor.getValue()), source, "Rendering does not change Markdown");
  await page.locator(".markdown-source-view .ft-grid").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/live-preview.png" });

  await page.setViewportSize({ width: 800, height: 1000 });
  await page.waitForFunction(() => {
    const content = document.querySelector(".markdown-source-view .ft-grid > .callout-content");
    return content && content.scrollWidth > content.clientWidth;
  });
  await checkHorizontalScroll("live");
  await page.setViewportSize({ width: 1280, height: 1000 });

  await page.evaluate(() => {
    const editor = app.workspace.activeLeaf.view.editor;
    const index = editor.getValue().split("\n").findIndex(line => line.includes("25℃"));
    const line = editor.getLine(index);
    const offset = line.indexOf("25℃");
    editor.replaceRange("30℃", { line: index, ch: offset }, { line: index, ch: offset + 3 });
    editor.setCursor({ line: editor.lineCount() - 1, ch: 0 });
  });
  await page.waitForFunction(() => [...document.querySelectorAll(".markdown-source-view .ft-table td")].some(td => td.textContent === "30℃"));
  assert.equal((await layout("live")).captionCount, 4);

  // Exercise the editor command and its boundary/undo behavior in the real editor.
  await page.evaluate(() => {
    const editor = app.workspace.activeLeaf.view.editor;
    editor.setValue("前の本文\n![[example-apparatus.svg]]\n後の本文");
    editor.setCursor({ line: 1, ch: 0 });
    app.commands.executeCommandById("figures-and-tables:insert-figure");
  });
  assert.equal(await page.evaluate(() => app.workspace.activeLeaf.view.editor.getValue()),
    "前の本文\n\n> [!figure] キャプション\n> ![[example-apparatus.svg]]\n\n後の本文");
  assert.equal(await page.evaluate(() => app.workspace.activeLeaf.view.editor.getSelection()), "キャプション");
  await page.evaluate(() => app.workspace.activeLeaf.view.editor.undo());
  assert.equal(await page.evaluate(() => app.workspace.activeLeaf.view.editor.getValue()), "前の本文\n![[example-apparatus.svg]]\n後の本文");

  await page.evaluate(async source => {
    app.workspace.activeLeaf.view.editor.setValue(source);
    await app.plugins.disablePlugin("figures-and-tables");
  }, source);
  assert.equal(await page.locator(".ft-callout").count(), 0, "Unloading restores native callouts");
  await page.evaluate(async () => { await app.plugins.enablePlugin("figures-and-tables"); });
  await page.waitForFunction(() => document.querySelectorAll(".ft-callout").length > 0);
  assert.deepEqual(errors, [], "No renderer errors");
  const version = /Obsidian ([\d.]+)/.exec(await page.title())?.[1] ?? "unknown";
  console.log(`PASS Obsidian ${version}: reading, Live Preview, grid boundaries, captions, spans, narrow pane, table edit, command/undo, unload/reload`);
  console.log(`Screenshots: test-results/. Disposable vault: ${vault}`);
} finally {
  await browser?.close();
  child?.kill("SIGTERM");
}
