import { load } from "cheerio";
import { fragment } from "xmlbuilder2";
import { XMLBuilder } from "xmlbuilder2/lib/interfaces";

import {
  QtiPromptInteraction,
  QtiPromptInteractionOptions,
} from "./interaction";
import { toElementName, toAttributeName } from "../../utils/version";
import { QtiVersion } from "../types";

export type SelectPointObjectOptions = {
  data: string;
  type?: string;
  width?: number;
  height?: number;
};

export type SelectPointInteractionOptions = QtiPromptInteractionOptions & {
  minChoices?: number;
  maxChoices?: number;
  object: SelectPointObjectOptions;
};

/**
 * Presents an image where candidates select specific coordinate points.
 * Used for identifying precise locations on maps, graphs, or diagrams.
 *
 * @see https://www.imsglobal.org/spec/qti/v3p0/impl#h.ev30y6ze263d
 *
 * @example
 * const interaction = new SelectPointInteraction({
 *   responseIdentifier: "RESPONSE",
 *   maxChoices: 1,
 *   object: { data: "graph.png", type: "image/png", width: 400, height: 300 },
 * });
 */
export class SelectPointInteraction extends QtiPromptInteraction {
  public static tagName = "qti-select-point-interaction";

  public minChoices?: number;
  public maxChoices?: number;
  public object: SelectPointObjectOptions;

  constructor(options: SelectPointInteractionOptions) {
    super(options);

    this.minChoices = options.minChoices;
    this.maxChoices = options.maxChoices;
    this.object = options.object;
  }

  public static fromXmlString(xml: string): SelectPointInteraction {
    const $ = load(xml, { xmlMode: true });
    const $root = $("qti-select-point-interaction");
    // QTI 3.0 also allows the image as an <img>
    const $object = $root.children("object, img").first();

    return new SelectPointInteraction({
      responseIdentifier: $root.attr("response-identifier")!,
      label: $root.attr("label"),
      minChoices: $root.attr("min-choices")
        ? Number($root.attr("min-choices"))
        : undefined,
      maxChoices: $root.attr("max-choices")
        ? Number($root.attr("max-choices"))
        : undefined,
      object: {
        data: ($object.attr("data") ?? $object.attr("src"))!,
        type: $object.attr("type"),
        width: $object.attr("width")
          ? Number($object.attr("width"))
          : undefined,
        height: $object.attr("height")
          ? Number($object.attr("height"))
          : undefined,
      },
    });
  }

  protected buildXmlPayload(version: QtiVersion): XMLBuilder {
    const el = (name: string) => toElementName(name, version);
    const attr = (name: string) => toAttributeName(name, version);

    const item = fragment().ele(el("qti-select-point-interaction"), {
      [attr("response-identifier")]: this.responseIdentifier,
      label: this.label,
      [attr("min-choices")]: this.minChoices?.toString(),
      [attr("max-choices")]: this.maxChoices?.toString(),
    });

    item.ele("object", {
      data: this.object.data,
      type: this.object.type,
      width: this.object.width?.toString(),
      height: this.object.height?.toString(),
    });

    return item;
  }
}
