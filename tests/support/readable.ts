import type { Page } from "@playwright/test";

/**
 * Every piece of visible text whose contrast against what it actually sits on
 * is under 4.5:1, as `ratio "text" in tag.class`. The same check the client
 * rooms are held to (tests/light-room-readable.spec.ts), kept here so a
 * component check can use it too.
 */
export function unreadable(page: Page) {
  return page.evaluate(() => {
    type Colour = { r: number; g: number; b: number; a: number };
    // rgb()/rgba(), and the color(srgb r g b / a) form the browser reports for a color-mix() value:
    // without it a button with a mixed background would be measured against the page behind it.
    const parse = (value: string): Colour | null => {
      const match = /rgba?\(([^)]+)\)/.exec(value || "");
      if (match) { const p = match[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; }
      const mixed = /color\(srgb ([^)]+)\)/.exec(value || "");
      if (!mixed) return null;
      const q = mixed[1].split(/[ /]+/).filter(Boolean).map(Number);
      return { r: q[0] * 255, g: q[1] * 255, b: q[2] * 255, a: q.length > 3 ? q[3] : 1 };
    };
    const over = (top: Colour, under: Colour): Colour => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
    const channel = (value: number) => { const v = value / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const luminance = (c: Colour) => 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
    const rows: string[] = [];
    for (const element of document.querySelectorAll<HTMLElement>("body *")) {
      if (element.closest("svg, script, style, option, :disabled")) continue;
      const text = [...element.childNodes].filter((node) => node.nodeType === 3).map((node) => node.textContent!.trim()).join(" ").trim();
      const style = getComputedStyle(element), box = element.getBoundingClientRect();
      if (!text || style.visibility === "hidden" || box.width < 2 || box.height < 2) continue;
      let ground: Colour = { r: 255, g: 255, b: 255, a: 1 }, opacity = 1;
      const chain: Element[] = []; for (let node: Element | null = element; node; node = node.parentElement) chain.unshift(node);
      for (const node of chain) {
        const painted = getComputedStyle(node), fill = parse(painted.backgroundColor);
        if (fill && fill.a > 0) ground = over(fill, ground);
        const stops = [...painted.backgroundImage.matchAll(/rgba?\([^)]+\)/g)].map((match) => parse(match[0])!);
        if (stops.length) ground = over({ r: stops.reduce((sum, c) => sum + c.r, 0) / stops.length, g: stops.reduce((sum, c) => sum + c.g, 0) / stops.length, b: stops.reduce((sum, c) => sum + c.b, 0) / stops.length, a: stops.reduce((sum, c) => sum + c.a, 0) / stops.length }, ground);
        // A positioned ::before that paints a surface under the text (the readiness score's
        // white centre inside its ring) is what the text actually sits on.
        const before = getComputedStyle(node, "::before"), cover = parse(before.backgroundColor);
        if (before.content !== "none" && before.position === "absolute" && cover && cover.a > 0) {
          const outer = node.getBoundingClientRect();
          if (box.top >= outer.top + parseFloat(before.top) && box.left >= outer.left + parseFloat(before.left) && box.bottom <= outer.bottom - parseFloat(before.bottom) && box.right <= outer.right - parseFloat(before.right)) ground = over(cover, ground);
        }
        opacity *= Number(painted.opacity);
      }
      const ink = parse(style.color); if (!ink) continue;
      const shown = over({ ...ink, a: ink.a * opacity }, ground), light = luminance(shown), dark = luminance(ground);
      const ratio = (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05);
      if (ratio < 4.5) rows.push(`${ratio.toFixed(2)} "${text.slice(0, 50)}" in ${element.tagName.toLowerCase()}.${String(element.className).split(" ")[0]}`);
    }
    return [...new Set(rows)];
  });
}
