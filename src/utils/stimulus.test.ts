import { describe, expect, test } from "vitest";

import { getIncludedHrefs, replaceStimulusPlacements } from "./stimulus";

describe("replaceStimulusPlacements", () => {
  const refs = [
    { identifier: "STIM-1", href: "stim-1.xml" },
    { identifier: "STIM-2", href: "stim-2.xml" },
    { identifier: "STIM-3", href: "stim-3.xml" },
  ];
  const render = (ref: { identifier: string }) =>
    `<aside>${ref.identifier}</aside>`;

  test("it replaces data-stimulus-idref and XInclude placements", () => {
    const { html, placed } = replaceStimulusPlacements(
      `<div data-stimulus-idref="STIM-1"/><p>Question</p><xi:include xmlns:xi="http://www.w3.org/2001/XInclude" href="stim-2.xml"/>`,
      refs,
      render,
    );

    expect(html).toBe(
      "<aside>STIM-1</aside><p>Question</p><aside>STIM-2</aside>",
    );
    expect(placed.map((ref) => ref.identifier)).toEqual(["STIM-1", "STIM-2"]);
  });

  test("it leaves placements for unknown stimuli alone", () => {
    const { html, placed } = replaceStimulusPlacements(
      `<div data-stimulus-idref="OTHER"/><p>Question</p>`,
      refs,
      render,
    );

    expect(html).toBe(`<div data-stimulus-idref="OTHER"/><p>Question</p>`);
    expect(placed).toEqual([]);
  });
});

describe("getIncludedHrefs", () => {
  test("it lists the files an item body includes as XML", () => {
    expect(
      getIncludedHrefs(
        `<xi:include xmlns:xi="http://www.w3.org/2001/XInclude" href="passage.xml" parse="xml"/>
        <p>Question</p>
        <xi:include href="other.xml"/>
        <xi:include href="notes.txt" parse="text"/>`,
      ),
    ).toEqual(["passage.xml", "other.xml"]);
  });
});
