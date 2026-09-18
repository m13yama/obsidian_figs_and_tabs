# Figures and Tables

An Obsidian plugin that adds captions to figures and tables and arranges them side by side or in grids using callouts. It supports Reading view and Live Preview while preserving your original image links and Markdown tables.

The plugin is currently in beta. Download it from [GitHub Releases](https://github.com/m13yama/obsidian_figs_and_tabs/releases).

Version 0.2.0 adds captionless and mixed content, centered grids with columns sized to their content, and separate horizontal and vertical spacing. When upgrading from 0.1.0, replace `gap=16` in your notes with `lgap=16 vgap=16`. The old saved `gap` setting is not migrated.

## Installation

1. Download `figures-and-tables-0.2.0.zip` from the Assets section of the [0.2.0 beta release](https://github.com/m13yama/obsidian_figs_and_tabs/releases/tag/0.2.0) and extract it.
2. Copy the extracted `figures-and-tables` folder into your vault's `.obsidian/plugins/` directory.
3. In Obsidian, open **Settings → Community plugins** and enable **Figures and Tables**. Reload Obsidian if needed.

Only `main.js`, `manifest.json`, and `styles.css` are required. You can also download these files individually from the release assets and place them in `.obsidian/plugins/figures-and-tables/`. Source files and `node_modules` are not needed. GitHub's automatically generated "Source code" ZIP is not an installable plugin package.

## Figures and tables

```markdown
> [!figure] Overview of the experimental apparatus
> ![[apparatus.png]]

> [!table] Accuracy by method
> | Method | Accuracy |
> | --- | ---: |
> | A | 92.1% |
> | B | 95.3% |
```

Figure captions appear below the content and table captions above it. Both are centered. Captions support the formatting Obsidian allows in callout titles, including bold text, links, and inline math. Images can also use standard Markdown syntax: `![Alt text](images/apparatus.png)`. Alt text and captions are independent.

The plugin removes callout backgrounds, borders, icons, and text tinting. Table borders inherit the note's settings, and figures and tables use the same theme styles as the rest of the note.

Use `[!figure|caption=top]` or `[!table|caption=bottom]` to override the caption position for an individual item. You can change the default position for figures and tables separately in the plugin settings.

## Grids

```markdown
> [!grid|cols=2 lgap=16 vgap=16]
> > [!figure] Experimental apparatus
> > ![[apparatus.png]]
>
> > [!table] Measurement conditions
> > | Item | Value |
> > | --- | --- |
> > | Temperature | 25°C |
>
> > [!figure|span=2] Reading over time
> > ![[results.png]]

This paragraph is outside the grid.
```

This places a figure and a table in the first row, followed by a figure spanning both columns. Four items without `span` form a 2×2 grid. Items follow their order in the Markdown source. Figures and tables that are direct children of the grid occupy cells; other content occupies a full row.

### Captionless and mixed content

Tables without captions can be written directly inside a `grid`, without a `table` callout. They can be mixed with captioned tables and images, in source order.

```markdown
> [!grid|cols=2 lgap=16 vgap=16]
> | Diameter | Ampacity |
> | --- | --- |
> | 1.6 mm | 27 A |
> | 2.0 mm | 35 A |
>
> > [!table] Cross-sectional area and ampacity
> > | Area | Ampacity |
> > | --- | --- |
> > | 2.0 mm² | 27 A |
> > | 3.5 mm² | 37 A |
>
> ![[apparatus.png]]
>
> > [!figure] Measurement results
> > ![[results.png]]
```

The first row contains a captionless table and a captioned table. The second contains a captionless image and a captioned figure.

Separate tables or images with a line containing only `>`. A paragraph containing only images is one grid item: multiple images in the same paragraph remain together. A paragraph containing both text and images is treated as ordinary content and occupies a full row. Captionless items each use one column. To span columns, use a `figure` or `table` callout with `span`.

### Layout options

| Option | Applies to | Values | Default |
| --- | --- | --- | --- |
| `cols=2` | grid | Integer from 1 to 6 | Default columns setting (initially 2) |
| `lgap=16` | grid | Horizontal spacing in pixels, integer from 0 to 96 | Default horizontal spacing setting (initially 16) |
| `vgap=16` | grid | Vertical spacing in pixels, integer from 0 to 96 | Default vertical spacing setting (initially 16) |
| `span=2` | figure / table | Integer from 1 to 6 | 1 column; values above the parent grid's column count are clamped |
| `caption=bottom` | figure / table | `top` or `bottom` | Caption position setting |

Separate options with spaces. Unknown options and invalid values are ignored without preventing the content from rendering. If the same option appears more than once, the last valid value is used.

Each column uses the width required by its content and captions, and the grid as a whole is centered. Horizontal spacing (`lgap`) and vertical spacing (`vgap`) are independent. For example, `[!grid|cols=2 lgap=32 vgap=24]` sets 32px between columns and 24px between rows.

Narrow panes retain the configured columns and spans. When the grid does not fit, it starts at the left edge and scrolls horizontally. Images preserve their aspect ratio. Use Obsidian's image width syntax, such as `![[image.png|300]]`, to set a width explicitly.

The old `gap` option has been removed. Neither the old syntax nor the saved `gap` setting is migrated. Use `lgap` and `vgap` in your notes.

### Where a grid ends

- A line containing only `>` continues the outer grid and separates its child items.
- A completely blank line, without `>`, followed by ordinary text or another callout ends the grid.
- Simply omitting `>` may leave text inside the quotation because Markdown allows paragraph continuation. Insert a blank line when returning to ordinary text.

The plugin uses the callout boundaries parsed by Obsidian. There is no custom closing tag. Disabling the plugin leaves the figures, tables, and descriptions as ordinary callouts.

## Editing commands

Search for `Figures and Tables` in the command palette. You can assign shortcuts in Obsidian's Hotkeys settings.

| Command | Behavior |
| --- | --- |
| Insert figure / wrap selection | Wrap selected lines, or the current line, in a figure callout. On an empty line, insert an image template. |
| Insert table / wrap selection | Wrap a complete selected table, including its header and separator row. On an empty line, insert a table template. |
| Insert grid / wrap selected figures and tables | Wrap complete selected figure/table callouts in a grid. On an empty line, insert a template with two figures. |
| Change grid columns (from the header) | Place the cursor on the `[!grid]` header and choose 1 to 6 columns. |

After creating a figure or table, the `Caption` placeholder is selected so you can replace it immediately. Commands operate on complete lines and can be reverted with one Undo. When wrapping multiple callouts in a grid, include `>` on every line inside each callout.

Live Preview uses Obsidian's native callout rendering and editing controls. Use the callout's edit button to reveal its Markdown. The plugin does not provide a separate table cell editor.

## Examples

Copy the Markdown notes and both SVG files from `examples/` into the same vault:

- [Figures and grids](examples/figures-and-grids.md): standalone figures and tables, column spans, a 2×2 grid, caption positions, and invalid option fallbacks.
- [Captionless and mixed content](examples/captionless-and-mixed.md): captionless tables and images, mixed captions, independent spacing, and image widths.

## Development and verification

Use Node.js 22.13 or later. To build from source, run the following commands, then copy the generated `dist/figures-and-tables` folder into your vault's `.obsidian/plugins/` directory.

```sh
npm ci
npm test
npm run build
```

`npm run dev` watches the source and rebuilds `main.js`. `npm run build` updates the distribution files in `dist/`.

An integration test runs against the actual Obsidian application:

```sh
npm run build
npm run test:obsidian
```

On Linux, the test launches `/opt/Obsidian/obsidian`. Set `OBSIDIAN_BIN` to use a different executable. A desktop session is required. The test creates a dedicated profile and vault in a temporary directory, then closes the Obsidian process it started. It does not use your existing vault. Screenshots are written to `test-results/`.

### Implementation

- `src/options.ts`: settings and callout option validation.
- `src/render.ts`: decoration of existing DOM nodes, accessible caption associations, change observation, and cleanup.
- `src/editor.ts`: a CodeMirror 6 extension that watches native Live Preview callouts and updates their presentation.
- `src/commands.ts`: line-based Markdown transformations that preserve quotation depth and surrounding boundaries.
- `src/main.ts`: plugin registration, the Reading view post processor, commands, and settings.
- `styles.css`: CSS Grid layout, caption placement, and styles for narrow panes and printing.

Rendering does not rewrite note content. The plugin adds attributes and styles while preserving image, table, and link nodes and their event handlers. Observation is limited to rendered sections and editor content. Attributes added by the plugin are excluded from observation to avoid update loops. Disabling the plugin removes its decorations.

### Current scope

Verified with Obsidian 1.12.7 on Linux using the default theme: Reading view and Live Preview, captionless and mixed content, centered grids sized to their content, independent spacing, grid boundaries, caption positions, spans, horizontal scrolling in narrow panes, explicit image widths, wide tables, table edits, commands and Undo, and disabling/re-enabling the plugin. Figure and table styles are compared with ordinary note content in light and dark modes and with customized table border colors. All 27 unit tests for options, editing transformations, and the rendering lifecycle pass.

Implemented features include captions, grids, column spans, layout settings, and editing commands. Automatic numbering, cross-references, subfigure labels such as (a)/(b), and vault-wide lists of figures and tables are not implemented. Print CSS is included, but PDF export, physical mobile devices, and community themes still need verification.

The syntax builds on [Obsidian callouts](https://obsidian.md/help/callouts), and rendering is extended through the [Obsidian public API](https://github.com/obsidianmd/obsidian-api).
