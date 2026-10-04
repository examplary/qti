import { load } from "cheerio";
import { create } from "xmlbuilder2/lib/index.js";

import { QTI_VERSION_CONFIG, QtiVersion } from "./types";
import { ImsManifestResourceType } from "../ims/ims-manifest";
import { ImsPackage } from "../ims/ims-package";
import { appendHtmlFragment, extractHtmlFragment } from "../utils/html";

export type QtiStimulusOptions = {
  identifier: string;
  title?: string;
  language?: string;
  html?: string;
};

/**
 * Content shared between items, like a reading passage. Only QTI 3.0 has
 * stimuli; items refer to them with a stimulus reference.
 */
export class QtiStimulus {
  public identifier: string;
  public title?: string;
  public language?: string;
  public html: string;

  constructor(options: QtiStimulusOptions) {
    this.identifier = options.identifier;
    this.title = options.title;
    this.language = options.language;
    this.html = options.html ?? "";
  }

  public static fromXmlString(xml: string): QtiStimulus {
    const $ = load(xml, { xmlMode: true });
    const root = $("qti-assessment-stimulus");
    if (!root.length) {
      throw new Error("Missing qti-assessment-stimulus element");
    }

    return new QtiStimulus({
      identifier: root.attr("identifier") ?? "",
      title: root.attr("title"),
      language: root.attr("xml:lang"),
      html: extractHtmlFragment(root.children("qti-stimulus-body")),
    });
  }

  /**
   * Reads a file an item body includes: a stimulus, or a fragment of item
   * body content, like a `<div>` holding a passage.
   */
  public static fromIncludedXmlString(xml: string): QtiStimulus {
    const $ = load(xml, { xmlMode: true });
    if ($("qti-assessment-stimulus").length) {
      return QtiStimulus.fromXmlString(xml);
    }

    const root = $.root().children().first();
    if (!root.length) throw new Error("Missing included element");
    for (const name of Object.keys(root.attr() ?? {})) {
      if (/^(xmlns(:|$)|xsi:)/.test(name)) root.removeAttr(name);
    }

    return new QtiStimulus({
      identifier: root.attr("identifier") ?? "",
      language: root.attr("xml:lang"),
      html: $.xml(root),
    });
  }

  public buildXml(): string {
    const config = QTI_VERSION_CONFIG[QtiVersion.v3p0];
    const stimulus = create({ version: "1.0", encoding: "UTF-8" }).ele(
      "qti-assessment-stimulus",
      {
        xmlns: config.namespace,
        "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
        "xsi:schemaLocation": config.schemaLocation,
        identifier: this.identifier,
        title: this.title,
        "xml:lang": this.language,
      },
    );
    appendHtmlFragment(this.html, stimulus.ele("qti-stimulus-body"));

    return stimulus.end({ prettyPrint: true });
  }

  public async addToPackage(pkg: ImsPackage, filename = this.filename) {
    await pkg.addResource(
      {
        identifier: this.identifier,
        type: ImsManifestResourceType.imsqti_stimulus_xmlv3p0,
      },
      [{ filename, data: this.buildXml() }],
    );
  }

  public get filename() {
    return `stimulus-${this.identifier}.xml`;
  }
}
