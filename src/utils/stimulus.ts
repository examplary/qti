import { load } from "cheerio";
import type { AnyNode } from "domhandler";

import type { QtiStimulusRef } from "../qti/qti-item";

const isInclude = (_: number, node: AnyNode) =>
  "name" in node && node.name.split(":").pop() === "include";

/**
 * Replaces the places an item body asks for a stimulus, either an element
 * with `data-stimulus-idref` or an XInclude of the stimulus file, with
 * `render(ref)`. Returns the stimuli that were placed, so the others can go
 * wherever the caller shows unplaced stimuli.
 */
export const replaceStimulusPlacements = (
  html: string,
  refs: QtiStimulusRef[],
  render: (ref: QtiStimulusRef) => string,
): { html: string; placed: QtiStimulusRef[] } => {
  const $ = load(html, { xmlMode: true });
  const placed = new Set<QtiStimulusRef>();

  const replace = (node: AnyNode, ref: QtiStimulusRef | undefined) => {
    if (!ref) return;
    $(node).replaceWith(render(ref));
    placed.add(ref);
  };

  $("[data-stimulus-idref]").each((_, node) => {
    const identifier = $(node).attr("data-stimulus-idref");
    replace(
      node,
      refs.find((ref) => ref.identifier === identifier),
    );
  });
  $("*")
    .filter(isInclude)
    .each((_, node) => {
      const href = $(node).attr("href");
      replace(
        node,
        refs.find((ref) => ref.href === href),
      );
    });

  return { html: $.root().html() ?? "", placed: [...placed] };
};
