import { context } from "esbuild";
import { mkdir, copyFile } from "node:fs/promises";

const production = process.argv.includes("production");
const build = await context({
  entryPoints: ["src/main.ts"],
  outfile: "main.js",
  bundle: true,
  platform: "browser",
  format: "cjs",
  target: "es2021",
  external: ["obsidian", "@codemirror/state", "@codemirror/view"],
  sourcemap: production ? false : "inline",
  minify: production,
  logLevel: "info",
  banner: { js: "/* Generated from src/main.ts by esbuild. */" },
});

if (production) {
  await build.rebuild();
  await build.dispose();
  await mkdir("dist/figures-and-tables", { recursive: true });
  for (const file of ["main.js", "manifest.json", "styles.css"]) {
    await copyFile(file, `dist/figures-and-tables/${file}`);
  }
} else {
  await build.watch();
}
