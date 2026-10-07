import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  dimensionsFromVideoElement,
  extractVideoEmbeds,
  parseVideoDimensions,
  VideoSizeRenderer,
} from "../src/video";

const renderers: VideoSizeRenderer[] = [];

afterEach(() => {
  for (const renderer of renderers.splice(0)) renderer.destroy();
  document.body.replaceChildren();
});

describe("video size syntax", () => {
  it("accepts image-style width and width-by-height tokens", () => {
    expect(parseVideoDimensions("640")).toEqual({ width: 640 });
    expect(parseVideoDimensions("640x360")).toEqual({ width: 640, height: 360 });
    expect(parseVideoDimensions(" 640 X 360 ")).toEqual({ width: 640, height: 360 });
    expect(parseVideoDimensions("640×360")).toEqual({ width: 640, height: 360 });
    for (const value of ["", "0", "640x0", "-1", "2.5", "640px", "100001", "640x100001"]) {
      expect(parseVideoDimensions(value)).toBeNull();
    }
  });

  it("extracts supported video embeds in source order, including unsized ones", () => {
    const source = "![[one.mp4|640x360]] ![[image.png|200]] ![[two.WEBM]] ![[three.mov#t=2|320]] ![[audio.ogg|100]]";
    expect(extractVideoEmbeds(source).map(embed => embed.dimensions)).toEqual([
      { width: 640, height: 360 }, null, { width: 320 },
    ]);
  });

  it("uses attributes on native media wrappers as a fallback", () => {
    const wrapper = document.createElement("span");
    wrapper.className = "internal-embed media-embed";
    wrapper.setAttribute("data-href", "movie.mp4|480x270");
    wrapper.innerHTML = "<video></video>";
    expect(dimensionsFromVideoElement(wrapper.querySelector("video")!)).toEqual({ width: 480, height: 270 });
  });
});

describe("video rendering", () => {
  it("centers sized standalone videos", () => {
    const style = document.createElement("style");
    style.textContent = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
    document.head.append(style);
    const video = document.createElement("video");
    video.className = "ft-video";
    document.body.append(video);

    const computed = getComputedStyle(video);
    expect(computed.display).toBe("block");
    expect(computed.marginInline).toBe("auto");

    style.remove();
  });

  it("sizes videos without replacing native nodes and cleans up on unload", () => {
    const root = document.createElement("div");
    root.innerHTML = "<p><video></video></p><p><video></video></p>";
    document.body.append(root);
    const videos = Array.from(root.querySelectorAll("video"));
    let clicked = false;
    videos[0]!.addEventListener("click", () => clicked = true);
    const renderer = new VideoSizeRenderer();
    renderers.push(renderer);
    const controller = renderer.watchMarkdown(root, "![[one.mp4|640x360]]\n![[two.webm]]");

    expect(Array.from(root.querySelectorAll("video"))).toEqual(videos);
    videos[0]!.click();
    expect(clicked).toBe(true);
    expect(videos[0]!.classList.contains("ft-video-with-ratio")).toBe(true);
    expect(videos[0]!.style.getPropertyValue("--ft-video-width")).toBe("640px");
    expect(videos[0]!.style.getPropertyValue("--ft-video-aspect-ratio")).toBe("640 / 360");
    expect(videos[1]!.classList.contains("ft-video")).toBe(false);

    controller.destroy();
    expect(videos[0]!.className).toBe("");
    expect(videos[0]!.style.cssText).toBe("");
  });

  it("reacts to delayed videos and wrapper dimension changes", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const renderer = new VideoSizeRenderer();
    renderers.push(renderer);
    renderer.watchMarkdown(root, "");
    root.innerHTML = '<span class="internal-embed media-embed" width="300"><video></video></span>';
    await new Promise(resolve => setTimeout(resolve, 0));
    const wrapper = root.firstElementChild!;
    const video = root.querySelector("video")!;
    expect(video.style.getPropertyValue("--ft-video-width")).toBe("300px");
    wrapper.setAttribute("width", "420x240");
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(video.style.getPropertyValue("--ft-video-width")).toBe("420px");
    expect(video.style.getPropertyValue("--ft-video-aspect-ratio")).toBe("420 / 240");
    wrapper.setAttribute("width", "500");
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(video.style.getPropertyValue("--ft-video-width")).toBe("500px");
    expect(video.classList.contains("ft-video-with-ratio")).toBe(false);
    expect(video.style.getPropertyValue("--ft-video-aspect-ratio")).toBe("");
  });

  it("keeps shared decorations until every overlapping controller releases them", () => {
    const root = document.createElement("div");
    root.innerHTML = "<div><video></video></div>";
    document.body.append(root);
    const renderer = new VideoSizeRenderer();
    renderers.push(renderer);
    const outer = renderer.watchMarkdown(root, "![[one.mp4|500]]");
    const inner = renderer.watchMarkdown(root.firstElementChild as HTMLElement, "![[one.mp4|500]]");
    const video = root.querySelector("video")!;
    outer.destroy();
    expect(video.classList.contains("ft-video")).toBe(true);
    inner.destroy();
    expect(video.className).toBe("");
  });
});
