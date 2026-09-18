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
    "> [!grid|cols=2 lgap=24 vgap=40]",
    "> > [!figure] Figure A **Apparatus**",
    "> > ![[example-apparatus.svg]]",
    ">",
    "> > [!table] Table B Measurement conditions",
    "> > | Item | Value |",
    "> > | --- | --- |",
    "> > | Temperature | 25°C |",
    "> > | ID | ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 |",
    ">",
    "> > [!figure|span=2] Figure C Results",
    "> > ![[example-results.svg]]",
    "", "Text outside the grid", "",
    "> [!figure|caption=top] Figure D Standalone figure",
    "> ![[example-apparatus.svg]]", "", "Editing position",
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
        outside: [...root.querySelectorAll("p, .cm-line")].find(p => p.textContent === "Text outside the grid")?.closest(".ft-grid") === null,
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
  assert(Math.abs(wide.items[2].width - (wide.items[1].x + wide.items[1].width - wide.items[0].x)) < 1, "span=2 fills both content-sized columns");
  assert(Math.abs(wide.items[1].x - wide.items[0].x - wide.items[0].width - 24) < 1, "lgap controls horizontal spacing");
  assert(Math.abs(wide.items[2].y - Math.max(...wide.items.slice(0, 2).map(item => item.y + item.height)) - 40) < 1, "vgap controls vertical spacing independently");
  assert(wide.captions[0].title.y >= wide.captions[0].content.y + wide.captions[0].content.height, "Figure caption is below");
  assert(wide.captions[1].title.y < wide.captions[1].content.y, "Table caption is above");
  assert(wide.outside && wide.standalone === 1, "Blank line ends the grid");
  assert.equal(wide.captionCount, 4, "One native title per callout, including hidden grid title");
  assert(wide.contentWidth > wide.viewportWidth, "Wide content is reachable through the grid's horizontal scroll");
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
    const index = editor.getValue().split("\n").findIndex(line => line.includes("25°C"));
    const line = editor.getLine(index);
    const offset = line.indexOf("25°C");
    editor.replaceRange("30°C", { line: index, ch: offset }, { line: index, ch: offset + "25°C".length });
    editor.setCursor({ line: editor.lineCount() - 1, ch: 0 });
  });
  await page.waitForFunction(() => [...document.querySelectorAll(".markdown-source-view .ft-table td")].some(td => td.textContent === "30°C"));
  assert.equal((await layout("live")).captionCount, 4);

  // Exercise the editor command and its boundary/undo behavior in the real editor.
  await page.evaluate(() => {
    const editor = app.workspace.activeLeaf.view.editor;
    editor.setValue("Previous paragraph\n![[example-apparatus.svg]]\nFollowing paragraph");
    editor.setCursor({ line: 1, ch: 0 });
    app.commands.executeCommandById("figures-and-tables:insert-figure");
  });
  assert.equal(await page.evaluate(() => app.workspace.activeLeaf.view.editor.getValue()),
    "Previous paragraph\n\n> [!figure] Caption\n> ![[example-apparatus.svg]]\n\nFollowing paragraph");
  assert.equal(await page.evaluate(() => app.workspace.activeLeaf.view.editor.getSelection()), "Caption");
  await page.evaluate(() => app.workspace.activeLeaf.view.editor.undo());
  assert.equal(await page.evaluate(() => app.workspace.activeLeaf.view.editor.getValue()), "Previous paragraph\n![[example-apparatus.svg]]\nFollowing paragraph");

  const plainTables = [
    "> [!grid|cols=2 lgap=16 vgap=16] ",
    "> | Diameter   | Ampacity |",
    "> | ------ | -------- |",
    "> | 1.6 mm | 27 A     |",
    "> | 2.0 mm | 35 A     |",
    "> | 2.6 mm | 48 A     |",
    "> | 3.2 mm | 62 A     |",
    ">",
    ">| Area  | Ampacity |",
    ">| ------- | -------- |",
    ">| 2.0 mm² | 27 A     |",
    ">| 3.5 mm² | 37 A     |",
    ">| 5.5 mm² | 49 A     |",
    ">| 8.0 mm² | 61 A     |",
    "", "Editing position",
  ].join("\n");
  const mixed = [
    "> [!grid|cols=2 lgap=16 vgap=16]",
    "> | Diameter | Ampacity |",
    "> | --- | --- |",
    "> | 1.6 mm | 27 A |",
    "> | ID | ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 |",
    ">",
    "> > [!table] Captioned table",
    "> > | Area | Ampacity |",
    "> > | --- | --- |",
    "> > | 2.0 mm² | 27 A |",
    ">",
    "> ![[example-apparatus.svg]]",
    ">",
    "> > [!figure] Captioned figure",
    "> > ![[example-results.svg]]",
    ">",
    "> Explanatory text occupies a full row.",
    "", "Editing position",
  ].join("\n");
  const plainImages = [
    "> [!grid|cols=2]",
    "> ![[example-apparatus.svg]]",
    ">",
    "> ![Results](example-results.svg)",
    "", "Editing position",
  ].join("\n");
  const centered = [
    "> [!grid|cols=2 lgap=32 vgap=48]",
    "> | A |",
    "> | --- |",
    "> | 1 |",
    ">",
    "> > [!table] Table B",
    "> > | A longer column heading | Reading |",
    "> > | --- | --- |",
    "> > | Temperature | 25°C |",
    ">",
    "> > [!table] Table C",
    "> > | A |",
    "> > | --- |",
    "> > | 2 |",
    ">",
    "> | A longer column heading | Reading |",
    "> | --- | --- |",
    "> | Temperature | 30°C |",
    "", "Editing position",
  ].join("\n");
  const sizedImages = [
    "> [!grid|cols=2 lgap=20 vgap=0]",
    "> ![[example-apparatus.svg|120]]",
    ">",
    "> > [!figure] Figure B",
    "> > ![[example-results.svg|240]]",
    "", "Editing position",
  ].join("\n");

  async function inspectItems(mode) {
    return page.evaluate(mode => {
      const root = document.querySelector(mode === "reading" ? ".markdown-preview-view" : ".markdown-source-view");
      const content = root.querySelector(".ft-grid > .callout-content");
      const items = [...content.querySelectorAll(":scope > :is(.ft-callout, .ft-grid-item)")];
      const prose = [...content.querySelectorAll(":scope > p")].find(p => p.textContent.startsWith("Explanatory text"));
      return {
        items: items.map(element => {
          const { x, y, width, height } = element.getBoundingClientRect();
          return { x, y, width, height,
            type: element.getAttribute("data-callout") ?? (element.classList.contains("ft-grid-table") ? "table" : "figure"),
            caption: element.querySelector(":scope > .callout-title") !== null,
          };
        }),
        columns: getComputedStyle(content).gridTemplateColumns.split(" ").length,
        proseFullWidth: !prose || Math.abs(prose.getBoundingClientRect().width -
          (items[1].getBoundingClientRect().right - items[0].getBoundingClientRect().left)) < 1,
        x: content.getBoundingClientRect().x, width: content.clientWidth, scrollWidth: content.scrollWidth,
        imageWidths: [...content.querySelectorAll("img")].map(image => image.getBoundingClientRect().width),
      };
    }, mode);
  }

  for (const fixture of [
    { name: "plain-tables", markdown: plainTables, types: ["table", "table"], captions: [false, false] },
    { name: "mixed", markdown: mixed, types: ["table", "table", "figure", "figure"], captions: [false, true, false, true] },
    { name: "plain-images", markdown: plainImages, types: ["figure", "figure"], captions: [false, false] },
    { name: "centered", markdown: centered, types: ["table", "table", "table", "table"], captions: [false, true, true, false] },
    { name: "sized-images", markdown: sizedImages, types: ["figure", "figure"], captions: [false, true] },
  ]) {
    await page.evaluate(async fixture => {
      const path = `${fixture.name}.md`;
      const existing = app.vault.getAbstractFileByPath(path);
      const file = existing ?? await app.vault.create(path, fixture.markdown);
      if (existing) await app.vault.modify(existing, fixture.markdown);
      await app.workspace.getLeaf(false).openFile(file, { state: { mode: "preview" } });
    }, fixture);
    for (const mode of ["reading", "live"]) {
      if (mode === "live") {
        await page.evaluate(async name => {
          const leaf = app.workspace.activeLeaf;
          await leaf.setViewState({ type: "markdown", state: { file: `${name}.md`, mode: "source", source: false } });
          leaf.view.editor.setCursor({ line: leaf.view.editor.lineCount() - 1, ch: 0 });
        }, fixture.name);
      }
      const rootSelector = mode === "reading" ? ".markdown-preview-view" : ".markdown-source-view";
      await page.waitForFunction(({ selector, count, imageCount }) => {
        const grid = document.querySelector(`${selector} .ft-grid > .callout-content`);
        return grid?.querySelectorAll(":scope > :is(.ft-callout, .ft-grid-item)").length === count &&
          grid.querySelectorAll("img").length === imageCount &&
          [...grid.querySelectorAll("img")].every(img => img.naturalWidth > 0 && img.getBoundingClientRect().width > 0);
      }, { selector: rootSelector, count: fixture.types.length, imageCount: fixture.types.filter(type => type === "figure").length });
      const state = await inspectItems(mode);
      assert.deepEqual(state.items.map(item => item.type), fixture.types, `${fixture.name}: original item order`);
      assert.deepEqual(state.items.map(item => item.caption), fixture.captions, `${fixture.name}: only explicit captions`);
      assert.equal(state.columns, 2);
      assert(Math.abs(state.items[0].y - state.items[1].y) < 1, `${fixture.name} (${mode}): horizontal layout ${JSON.stringify(state)}`);
      assert(state.items[1].x > state.items[0].x);
      assert(state.proseFullWidth, "Ordinary prose keeps a full row");
      if (fixture.name === "mixed") {
        assert(Math.abs(state.items[2].y - state.items[3].y) < 1, "Bare and captioned images share the second row");
        assert(state.items[2].y > state.items[0].y);
      }
      if (fixture.name === "centered" || fixture.name === "plain-tables") {
        const [first, second] = state.items;
        assert(state.scrollWidth <= state.width, "Small tables keep their natural widths");
        assert(Math.abs((first.x + second.x + second.width) / 2 - (state.x + state.width / 2)) < 1, "The group is centered in the note");
        assert(Math.abs(second.x - first.x - first.width - (fixture.name === "centered" ? 32 : 16)) < 1, "Horizontal space matches lgap exactly");
      }
      if (fixture.name === "centered") {
        const [first, second, third] = state.items;
        assert(second.width > first.width * 2, "Columns follow content instead of splitting width evenly");
        assert(Math.abs(third.y - Math.max(first.y + first.height, second.y + second.height) - 48) < 1, "Row spacing matches vgap independently");
      }
      if (fixture.name === "sized-images") assert.deepEqual(state.imageWidths, [120, 240], "Authored image widths override natural dimensions");
      await page.locator(`${rootSelector} .ft-grid`).scrollIntoViewIfNeeded();
      await page.screenshot({ path: `test-results/${fixture.name}-${mode}.png` });
      await page.setViewportSize({ width: 600, height: 1000 });
      const narrow = await inspectItems(mode);
      assert.equal(narrow.columns, 2);
      assert(narrow.scrollWidth > narrow.width, `${fixture.name}: narrow grids keep horizontal scrolling`);
      assert(Math.abs(narrow.items[0].x - narrow.x) < 1, "Overflow begins at the visible left edge");
      await page.setViewportSize({ width: 1280, height: 1000 });
      if (mode === "live") {
        assert.equal(await page.evaluate(() => app.workspace.activeLeaf.view.editor.getValue()), fixture.markdown);
      }
    }
  }

  // Compare against actual body tables/images, including a note-level theme override.
  const bodyTable = "| Item | Value |\n| --- | --- |\n| Temperature | 25°C |";
  const styled = [
    bodyTable, "",
    "> [!table] Table A", ...bodyTable.split("\n").map(line => `> ${line}`), "",
    "> [!grid|cols=2 lgap=32 vgap=16]",
    ...bodyTable.split("\n").map(line => `> ${line}`), ">",
    "> > [!table] Table B", ...bodyTable.split("\n").map(line => `> > ${line}`), "",
    "> [!note] Regular callout", ...bodyTable.split("\n").map(line => `> ${line}`), "",
    "![[example-apparatus.svg|120]]", "",
    "> [!figure] Figure A", "> ![[example-apparatus.svg|120]]", "", "Editing position",
  ].join("\n");
  await page.setViewportSize({ width: 1280, height: 1600 });
  await page.evaluate(async source => {
    const file = await app.vault.create("body-styles.md", source);
    await app.workspace.getLeaf(false).openFile(file, { state: { mode: "preview" } });
  }, styled);
  for (const mode of ["reading", "live"]) {
    if (mode === "live") {
      await page.evaluate(async () => {
        const leaf = app.workspace.activeLeaf;
        await leaf.setViewState({ type: "markdown", state: { file: "body-styles.md", mode: "source", source: false } });
        leaf.view.editor.setCursor({ line: leaf.view.editor.lineCount() - 1, ch: 0 });
      });
    }
    const selector = mode === "reading" ? ".markdown-preview-view" : ".markdown-source-view";
    await page.waitForFunction(selector => {
      const root = document.querySelector(selector);
      return root?.querySelectorAll("table").length === 5 && root.querySelector(".ft-figure img")?.naturalWidth > 0;
    }, selector);
    for (const theme of ["light", "dark", "custom"]) {
      const comparison = await page.evaluate(({ selector, theme }) => {
        document.body.classList.toggle("theme-dark", theme === "dark");
        document.body.classList.toggle("theme-light", theme !== "dark");
        const root = document.querySelector(selector);
        if (theme === "custom") root.style.setProperty("--table-border-color", "rgb(81, 103, 129)");
        else root.style.removeProperty("--table-border-color");
        const styles = (element, properties) => {
          const css = getComputedStyle(element);
          return Object.fromEntries(properties.map(property => [property, css[property]]));
        };
        const cellProps = ["borderTopColor", "borderTopWidth", "borderTopStyle", "backgroundColor", "color", "fontFamily", "fontSize", "fontWeight"];
        const imageProps = ["borderRadius", "boxShadow", "opacity", "filter", "mixBlendMode"];
        const bodyCell = [...root.querySelectorAll("td")].find(cell => !cell.closest(".callout"));
        const bodyImage = [...root.querySelectorAll("img")].find(img => !img.closest(".callout"));
        return {
          cell: styles(bodyCell, cellProps),
          cells: [...root.querySelectorAll(".ft-callout td")].map(cell => styles(cell, cellProps)),
          image: styles(bodyImage, imageProps),
          figure: styles(root.querySelector(".ft-figure img"), imageProps),
          decorations: [...root.querySelectorAll(".ft-callout, .ft-callout > .callout-content")].map(element => styles(element, ["backgroundColor", "borderTopWidth", "boxShadow", "mixBlendMode"])),
          noteBorder: getComputedStyle(root.querySelector('[data-callout="note"] td')).borderTopColor,
        };
      }, { selector, theme });
      for (const cell of comparison.cells) assert.deepEqual(cell, comparison.cell, `${mode}/${theme}: table styling matches body tables`);
      assert.deepEqual(comparison.figure, comparison.image, `${mode}/${theme}: image styling matches body images`);
      for (const decoration of comparison.decorations) {
        assert.deepEqual(decoration, { backgroundColor: "rgba(0, 0, 0, 0)", borderTopWidth: "0px", boxShadow: "none", mixBlendMode: "normal" }, "Callout decoration is removed");
      }
      assert.notEqual(comparison.noteBorder, comparison.cell.borderTopColor, "Ordinary callouts retain their original styling");
    }
  }

  // Bare items must also lose their plugin-only classes on unload.
  await page.evaluate(async () => { await app.plugins.disablePlugin("figures-and-tables"); });
  assert.equal(await page.locator(".ft-grid-item").count(), 0);
  await page.evaluate(async () => { await app.plugins.enablePlugin("figures-and-tables"); });
  await page.waitForFunction(() => document.querySelectorAll(".ft-grid-item").length > 0);

  await page.evaluate(async source => {
    app.workspace.activeLeaf.view.editor.setValue(source);
    await app.plugins.disablePlugin("figures-and-tables");
  }, source);
  assert.equal(await page.locator(".ft-callout").count(), 0, "Unloading restores native callouts");
  await page.evaluate(async () => { await app.plugins.enablePlugin("figures-and-tables"); });
  await page.waitForFunction(() => document.querySelectorAll(".ft-callout").length > 0);
  assert.deepEqual(errors, [], "No renderer errors");
  const version = /Obsidian ([\d.]+)/.exec(await page.title())?.[1] ?? "unknown";
  console.log(`PASS Obsidian ${version}: reading, Live Preview, bare/mixed items, centered content widths, lgap/vgap, image sizes, body styles in light/dark/custom colors, boundaries, captions, spans, horizontal scroll, table edit, command/undo, unload/reload`);
  console.log(`Screenshots: test-results/. Disposable vault: ${vault}`);
} catch (error) {
  const page = browser?.contexts()[0]?.pages()[0];
  if (page && !page.isClosed()) {
    await mkdir("test-results", { recursive: true });
    await page.screenshot({ path: "test-results/failure.png" }).catch(() => {});
    console.error(await page.evaluate(() => [...document.querySelectorAll(".markdown-preview-view .ft-grid > .callout-content > *, .markdown-source-view .ft-grid > .callout-content > *")].map(element => ({
      tag: element.tagName, classes: element.className,
      gridColumn: getComputedStyle(element).gridColumn,
      margin: getComputedStyle(element).margin,
      display: getComputedStyle(element).display,
      width: element.getBoundingClientRect().width,
      images: [...element.querySelectorAll("img")].map(img => ({ width: img.getBoundingClientRect().width, natural: img.naturalWidth, css: getComputedStyle(img).width })),
      html: element.outerHTML.slice(0,250),
    }))));
  }
  throw error;
} finally {
  await browser?.close();
  child?.kill("SIGTERM");
}
