import { describe, expect, it } from "vitest";
import { checkFile, checkSource, formatHit, variantFiles } from "./lib";

const found = (src: string, file = "client/src/components/x/variants/XDefault.tsx") =>
  checkSource(file, src).hits.map((h) => `${h.element}:${h.found.join(" ")}`);

describe("section spacing check", () => {
  it("flags vertical padding / margin on the outermost element", () => {
    expect(found(`export default function XDefault() { return <section className="py-12 md:py-16 px-4">x</section>; }`))
      .toEqual(["root:py-12 md:py-16"]);
    expect(found(`export function XDefault() { return <div className="-mt-8 mb-[40px]" />; }`))
      .toEqual(["root:-mt-8 mb-[40px]"]);
  });

  it("ignores zero, auto and horizontal spacing", () => {
    expect(found(`export default function XDefault() { return <div className="py-0 mt-auto px-6 mx-auto gap-8" />; }`)).toEqual([]);
  });

  it("checks the first child; bottom spacing only when it is the only child", () => {
    expect(found(`export default function XDefault() { return <section><div className="container py-16">a</div></section>; }`))
      .toEqual(["first child:py-16"]);
    expect(found(`export default function XDefault() { return <section><h2 className="mb-10">t</h2><div>g</div></section>; }`))
      .toEqual([]);
    expect(found(`export default function XDefault() { return <section><div className="pb-12">only</div></section>; }`))
      .toEqual(["first child:pb-12"]);
  });

  it("skips a first child that is a card, and an outermost element with a box edge", () => {
    expect(found(`export default function XDefault() { return <section><div className="rounded-xl p-8 py-10">c</div></section>; }`))
      .toEqual([]);
    expect(found(`export default function XDefault() { return <div className="rounded-[13px] border px-6 py-5">c</div>; }`))
      .toEqual([]);
    expect(found(`export default function XDefault() { return <div className="bg-muted py-16">x</div>; }`))
      .toEqual(["root:py-16"]);
  });

  it("reads cn() arguments, template literals and local consts", () => {
    expect(found(`
      const pad = "pt-10";
      export default function XDefault({ data }) {
        const bg = data.background || "bg-background";
        return <div className={cn("flex", data.wide ? "py-20" : "py-8", \`\${bg} \${pad}\`)} />;
      }`)).toEqual(["root:py-20 py-8 pt-10"]);
  });

  it("reads inline style objects", () => {
    expect(found(`export default function XDefault() { return <div style={{ paddingTop: 40, marginBottom: 0, paddingLeft: 8 }} />; }`))
      .toEqual(["root:style.paddingTop"]);
  });

  it("checks every return of the component, but not helper components", () => {
    expect(found(`
      function Card() { return <div className="py-12">helper</div>; }
      export default function XDefault({ data }) {
        if (!data) return <div className="py-8">empty</div>;
        return <section className="flex"><Card /></section>;
      }`)).toEqual(["root:py-8"]);
  });

  it("handles export default identifiers, memo() and fragments", () => {
    expect(found(`const XDefault = memo(({ data }) => <><div className="pt-6" /></>); export default XDefault;`))
      .toEqual(["root:pt-6"]);
  });

  it("exempts files with a marker comment", () => {
    const r = checkSource("f.tsx", `// section-spacing: self-padded\nexport default function F() { return <div className="py-16" />; }`);
    expect(r.marker).toBe("self-padded");
    expect(r.hits).toEqual([]);
  });

  it("every section variant in the repo passes", () => {
    const hits = variantFiles().flatMap((f) => checkFile(f).hits);
    expect(hits.map(formatHit)).toEqual([]);
  });
});
