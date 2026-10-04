import { load } from "cheerio";
import { create } from "xmlbuilder2/lib/index.js";

import { qtiInteractionTypes } from "./interactions";
import {
  QtiInteraction,
  QtiPromptInteraction,
} from "./interactions/interaction";
import { QtiElement } from "./qti-element";
import { QtiTest } from "./qti-test";
import {
  QtiCardinality,
  QtiBaseType,
  QtiAudience,
  QtiVersion,
  QTI_VERSION_CONFIG,
} from "./types";
import { getResourceType } from "../ims/ims-manifest";
import { ImsPackage } from "../ims/ims-package";
import { appendHtmlFragment } from "../utils/html";
import { toElementName, toAttributeName } from "../utils/version";

export type BuildXmlOptions = {
  version?: QtiVersion;
};

export type QtiItemOptions = {
  identifier?: string;
  adaptive?: boolean;
  timeDependent?: boolean;
  title?: string;
  language?: string;
  label?: string;
  toolName?: string;
  toolVersion?: string;
};

export type PciInteraction = {
  responseIdentifier: string;
  module: string;
  customInteractionTypeIdentifier: string;
  dataExamplarySettings?: string;
  class?: string;
};

export type ResponseMapping = {
  defaultValue?: number;
  entries: { mapKey: string; mappedValue: number; caseSensitive?: boolean }[];
};

export type ResponseDeclaration = {
  identifier: string;
  cardinality?: QtiCardinality;
  baseType?: QtiBaseType;
  correctResponse?: string[] | number[];
  /** Scores individual responses, e.g. each accepted answer to a text entry. */
  mapping?: ResponseMapping;
};

export type OutcomeDeclaration = {
  identifier: string;
  cardinality: QtiCardinality;
  baseType: QtiBaseType;
  defaultValue?: number | string;
  normalMaximum?: number;
  view?: QtiAudience;
};

export enum ResponseProcessingTemplate {
  MatchCorrect = "https://purl.imsglobal.org/spec/qti/v3p0/rptemplates/match_correct.xml",
  MapResponse = "https://purl.imsglobal.org/spec/qti/v3p0/rptemplates/map_response.xml",
  MapResponsePoint = "https://purl.imsglobal.org/spec/qti/v3p0/rptemplates/map_response_point.xml",
}

/** A reference to a stimulus shared between items (QTI 3.0 only). */
export type QtiStimulusRef = {
  identifier: string;
  href: string;
  title?: string;
};

export type ItemBodyElement =
  | {
      html: string;
    }
  | {
      interaction: QtiInteraction;
    }
  | {
      /** A paragraph of HTML with inline interactions in it, e.g. gaps in a text. */
      inline: (string | QtiInteraction)[];
    };

export class QtiItem extends QtiElement {
  public identifier: string;
  public adaptive?: boolean;
  public timeDependent?: boolean;
  public title?: string;
  public language?: string;
  public label?: string;
  public toolName?: string;
  public toolVersion?: string;

  protected responseDeclarations: Map<string, ResponseDeclaration> = new Map();
  protected responseProcessing: ResponseProcessingTemplate | null = null;
  protected summedMappedResponses: string[] | null = null;
  protected outcomeDeclarations: Map<string, OutcomeDeclaration> = new Map();
  protected itemBodyElements: ItemBodyElement[] = [];
  protected stimulusRefs: QtiStimulusRef[] = [];

  constructor(options?: QtiItemOptions) {
    super();
    this.identifier = options?.identifier || "item-" + Date.now();
    this.adaptive = options?.adaptive;
    this.timeDependent = options?.timeDependent;
    this.title = options?.title;
    this.language = options?.language;
    this.label = options?.label;
    this.toolName = options?.toolName;
    this.toolVersion = options?.toolVersion;
  }

  public static fromXmlString(xml: string): QtiItem {
    const $ = load(xml, { xmlMode: true });

    // Try QTI 3.0 first, then QTI 2.1
    let root = $("qti-assessment-item");
    let isV21 = false;

    if (!root.length) {
      root = $("assessmentItem");
      isV21 = true;
    }

    if (!root.length)
      throw new Error(
        "Missing assessment item element (qti-assessment-item or assessmentItem)",
      );

    // Version-aware attribute access
    const getAttr = (qti3Name: string) => {
      if (!isV21) return root.attr(qti3Name);
      return root.attr(toAttributeName(qti3Name, QtiVersion.v2p1));
    };

    const item = new QtiItem({
      identifier: root.attr("identifier"),
      adaptive: root.attr("adaptive") === "true",
      timeDependent: getAttr("time-dependent") === "true",
      title: root.attr("title"),
      language: root.attr("xml:lang"),
      label: root.attr("label"),
      // Older packages wrote these in camelCase, also in QTI 3.0
      toolName: getAttr("tool-name") ?? root.attr("toolName"),
      toolVersion: getAttr("tool-version") ?? root.attr("toolVersion"),
    });
    item.readNamespacedAttributes(root.attr() ?? {});

    root.children("qti-assessment-stimulus-ref").each((_, el) => {
      const $ref = $(el);
      const identifier = $ref.attr("identifier");
      const href = $ref.attr("href");
      if (identifier && href) {
        item.addStimulusRef({ identifier, href, title: $ref.attr("title") });
      }
    });

    // Parse response declarations (both versions)
    const responseDeclSelector = isV21
      ? "responseDeclaration"
      : "qti-response-declaration";
    root.find(responseDeclSelector).each((_, el) => {
      const $res = $(el);
      const responseId = $res.attr("identifier");
      if (!responseId) return;

      const correctRespSelector = isV21
        ? "correctResponse"
        : "qti-correct-response";
      const valueSelector = isV21 ? "value" : "qti-value";
      const correctResponseNode = $res.find(correctRespSelector);
      let correctResponse: string[] | number[] | undefined =
        correctResponseNode.length
          ? $(correctResponseNode)
              .find(valueSelector)
              .map((_, v) => $(v).text())
              .get()
          : undefined;

      let cardinality = ($res.attr("cardinality") ||
        "single") as QtiCardinality;
      const baseTypeAttr = isV21 ? "baseType" : "base-type";
      const baseType = ($res.attr(baseTypeAttr) || "string") as QtiBaseType;

      if (correctResponse) {
        if (baseType === "float" || baseType === "integer") {
          correctResponse = correctResponse.map((c) => Number(c));
        }
        if (correctResponse.length > 1 && cardinality === "single") {
          cardinality = "multiple";
        }
      }

      const attrOf = (name: string) =>
        isV21 ? toAttributeName(name, QtiVersion.v2p1) : name;
      const mappingNode = $res.find(isV21 ? "mapping" : "qti-mapping").first();
      const mapping: ResponseMapping | undefined = mappingNode.length
        ? {
            defaultValue: Number(
              mappingNode.attr(attrOf("default-value")) ?? 0,
            ),
            entries: mappingNode
              .find(isV21 ? "mapEntry" : "qti-map-entry")
              .map((_, entry) => ({
                mapKey: $(entry).attr(attrOf("map-key")) ?? "",
                mappedValue: Number($(entry).attr(attrOf("mapped-value"))),
                caseSensitive:
                  $(entry).attr(attrOf("case-sensitive")) !== "false",
              }))
              .get(),
          }
        : undefined;

      item.addResponseDeclaration({
        identifier: responseId,
        cardinality,
        baseType,
        correctResponse,
        mapping,
      });
    });

    // Parse outcome declarations (both versions)
    const outcomeDeclSelector = isV21
      ? "outcomeDeclaration"
      : "qti-outcome-declaration";
    root.find(outcomeDeclSelector).each((_, el) => {
      const $out = $(el);
      const outcomeId = $out.attr("identifier");
      if (!outcomeId) return;

      const defaultValueSelector = isV21 ? "defaultValue" : "qti-default-value";
      const valueSelector = isV21 ? "value" : "qti-value";
      const defaultValueNode = $out.find(defaultValueSelector);
      const valueNode = defaultValueNode.length
        ? $(defaultValueNode).find(valueSelector)
        : undefined;

      let defaultValue: string | number | undefined = valueNode?.length
        ? valueNode.text()
        : undefined;
      const cardinality = ($out.attr("cardinality") ||
        "single") as QtiCardinality;
      const baseTypeAttr = isV21 ? "baseType" : "base-type";
      const baseType = ($out.attr(baseTypeAttr) || "string") as QtiBaseType;
      if (defaultValue) {
        if (baseType === "float" || baseType === "integer") {
          defaultValue = Number(defaultValue);
        }
      }

      const normalMaximumAttr = isV21 ? "normalMaximum" : "normal-maximum";
      const normalMaximumRaw = $out.attr(normalMaximumAttr);
      const normalMaximum =
        normalMaximumRaw !== undefined && normalMaximumRaw !== ""
          ? Number(normalMaximumRaw)
          : undefined;

      item.addOutcomeDeclaration({
        identifier: outcomeId,
        cardinality,
        baseType,
        defaultValue,
        normalMaximum,
      });
    });

    // Parse item body (both versions)
    const itemBodySelector = isV21 ? "itemBody" : "qti-item-body";
    const itemBody = root.find(itemBodySelector);
    if (itemBody.length) {
      const $body = $(itemBody.first());
      for (const interactionType of Object.values(qtiInteractionTypes)) {
        if (!interactionType.tagName) continue;
        // Try both QTI 3.0 and 2.1 tag names
        const qti21TagName = toElementName(
          interactionType.tagName,
          QtiVersion.v2p1,
        );
        const interactionNodes = $body.find(
          `${interactionType.tagName}, ${qti21TagName}`,
        );

        for (const interactionNode of interactionNodes) {
          // A position-object interaction is wrapped in a stage that carries
          // its background image; parse from the stage so that is preserved.
          const parent = interactionNode.parent;
          const stageNode =
            parent &&
            "tagName" in parent &&
            (parent.tagName === "qti-position-object-stage" ||
              parent.tagName === "positionObjectStage")
              ? parent
              : interactionNode;
          const outerHtml = $(stageNode).prop("outerHTML")!;
          const interaction = interactionType.fromXmlString(
            outerHtml,
          ) as QtiInteraction;

          if (interaction instanceof QtiPromptInteraction) {
            const promptSelector = isV21 ? "prompt" : "qti-prompt";
            const promptHtml = $(interactionNode).find(promptSelector).html();
            if (promptHtml) {
              interaction.prompt = promptHtml.trim();
            }
          }

          item.addInteraction(interaction);
        }
      }
      const bodyHtml = $body.html();
      if (bodyHtml) {
        item.addItemBodyFromHtml(bodyHtml);
      }
    }

    // Parse response processing (both versions)
    const respProcSelector = isV21
      ? "responseProcessing"
      : "qti-response-processing";
    const responseProcessing = root.find(respProcSelector);
    if (responseProcessing.length) {
      const template = $(responseProcessing).attr("template");
      if (template) {
        // Map QTI 2.1 template URLs to our enum
        const mappedTemplate = QtiItem.mapTemplateUrlToEnum(template);
        if (mappedTemplate) {
          item.addResponseProcessing(mappedTemplate);
        }
      }
    }

    // Parse direct children whose tag name has a `prefix:elementName` form
    // — these are namespaced extension elements (e.g. our own
    // <examplary:question-metadata>).
    root.children().each((_, child) => {
      if (child.type !== "tag") return;
      const tagName = child.tagName;
      const colonIdx = tagName.indexOf(":");
      if (colonIdx <= 0) return;
      const namespace = tagName.slice(0, colonIdx);
      const elementName = tagName.slice(colonIdx + 1);
      const attributes: Record<string, string | undefined> = {};
      for (const [name, value] of Object.entries(child.attribs)) {
        // skip namespace-declaration attributes
        if (name.startsWith("xmlns")) continue;
        attributes[name] = value;
      }
      item.addNamespacedElement(
        namespace,
        elementName,
        $(child).text() || "",
        attributes,
      );
    });

    return item;
  }

  private static mapTemplateUrlToEnum(
    url: string,
  ): ResponseProcessingTemplate | null {
    // Check QTI 3.0 URLs
    if (
      Object.values(ResponseProcessingTemplate).includes(
        url as ResponseProcessingTemplate,
      )
    ) {
      return url as ResponseProcessingTemplate;
    }
    // Check QTI 2.1 URLs
    const v21Templates =
      QTI_VERSION_CONFIG[QtiVersion.v2p1].responseProcessingTemplates;
    if (url === v21Templates.matchCorrect) {
      return ResponseProcessingTemplate.MatchCorrect;
    }
    if (url === v21Templates.mapResponse) {
      return ResponseProcessingTemplate.MapResponse;
    }
    if (url === v21Templates.mapResponsePoint) {
      return ResponseProcessingTemplate.MapResponsePoint;
    }
    return null;
  }

  public buildXml(options?: BuildXmlOptions): string {
    const version = options?.version ?? QtiVersion.v3p0;
    const config = QTI_VERSION_CONFIG[version];
    const el = (name: string) => toElementName(name, version);
    const attr = (name: string) => toAttributeName(name, version);

    const item = create({ version: "1.0", encoding: "UTF-8" }).ele(
      el("qti-assessment-item"),
      {
        xmlns: config.namespace,
        "xmlns:m": "http://www.w3.org/1998/Math/MathML",
        "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
        "xsi:schemaLocation": config.schemaLocation,
        identifier: this.identifier,
        adaptive: this.adaptive?.toString(),
        // time-dependent is a required attribute on the assessment item.
        [attr("time-dependent")]: (this.timeDependent ?? false).toString(),
        label: this.label,
        title: this.title,
        [attr("tool-name")]: this.toolName || "Examplary QTI Module",
        [attr("tool-version")]: this.toolVersion || "1.0.0",
        "xml:lang": this.language,
      },
    );

    // Extensions
    this.appendNamespacesAndElements(item, version);

    // Response declaration
    // Note: some implementations expect the response to be defined before the body
    for (const responseDeclaration of this.responseDeclarations.values()) {
      const response = item.ele(el("qti-response-declaration"), {
        identifier: responseDeclaration.identifier,
        cardinality: responseDeclaration.cardinality || "single",
        [attr("base-type")]: responseDeclaration.baseType || "string",
      });
      if (responseDeclaration.correctResponse?.length) {
        const correctResponse = response.ele(el("qti-correct-response"));
        for (const value of responseDeclaration.correctResponse) {
          correctResponse.ele(el("qti-value")).txt(value.toString());
        }
      }
      if (responseDeclaration.mapping?.entries.length) {
        const mapping = response.ele(el("qti-mapping"), {
          [attr("default-value")]: (
            responseDeclaration.mapping.defaultValue ?? 0
          ).toString(),
        });
        for (const entry of responseDeclaration.mapping.entries) {
          mapping.ele(el("qti-map-entry"), {
            [attr("map-key")]: entry.mapKey,
            [attr("mapped-value")]: entry.mappedValue.toString(),
            [attr("case-sensitive")]: (entry.caseSensitive ?? true).toString(),
          });
        }
      }
    }

    // Outcome declaration
    for (const outcomeDeclaration of this.outcomeDeclarations.values()) {
      const outcome = item.ele(el("qti-outcome-declaration"), {
        [attr("base-type")]: outcomeDeclaration.baseType,
        cardinality: outcomeDeclaration.cardinality,
        identifier: outcomeDeclaration.identifier,
        [attr("normal-maximum")]: outcomeDeclaration.normalMaximum?.toString(),
      });
      if (outcomeDeclaration.defaultValue !== undefined) {
        outcome
          .ele(el("qti-default-value"))
          .ele(el("qti-value"))
          .txt(outcomeDeclaration.defaultValue.toString());
      }
    }

    if (version === QtiVersion.v3p0) {
      for (const stimulusRef of this.stimulusRefs) {
        item.ele("qti-assessment-stimulus-ref", { ...stimulusRef });
      }
    }

    // Item body
    const itemBody = item.ele(el("qti-item-body"));
    for (const element of this.itemBodyElements) {
      if ("html" in element) {
        appendHtmlFragment(element.html, itemBody);
      }
      if ("interaction" in element) {
        const builder = element.interaction.getXmlBuilder(version);
        const interactionClass = element.interaction
          .constructor as typeof QtiInteraction;
        if (interactionClass.inline) {
          // Inline interactions must live inside block-level content.
          itemBody.ele("p").import(builder);
        } else {
          itemBody.import(builder);
        }
      }
      if ("inline" in element) {
        const paragraph = itemBody.ele("p");
        for (const part of element.inline) {
          if (typeof part === "string") {
            appendHtmlFragment(part, paragraph);
          } else {
            paragraph.import(part.getXmlBuilder(version));
          }
        }
      }
    }

    // Response processing
    if (this.responseProcessing) {
      const templateUrl = this.getVersionedTemplateUrl(
        this.responseProcessing,
        version,
      );
      item.ele(el("qti-response-processing"), {
        template: templateUrl,
      });
    } else if (this.summedMappedResponses?.length) {
      const sum = item
        .ele(el("qti-response-processing"))
        .ele(el("qti-set-outcome-value"), { identifier: "SCORE" })
        .ele(el("qti-sum"));
      for (const identifier of this.summedMappedResponses) {
        sum.ele(el("qti-map-response"), { identifier });
      }
    }

    return item.end({ prettyPrint: true });
  }

  private getVersionedTemplateUrl(
    template: ResponseProcessingTemplate,
    version: QtiVersion,
  ): string {
    const templates = QTI_VERSION_CONFIG[version].responseProcessingTemplates;
    switch (template) {
      case ResponseProcessingTemplate.MatchCorrect:
        return templates.matchCorrect;
      case ResponseProcessingTemplate.MapResponse:
        return templates.mapResponse;
      case ResponseProcessingTemplate.MapResponsePoint:
        return templates.mapResponsePoint;
      default:
        return template;
    }
  }

  public getInteractions(): QtiInteraction[] {
    return this.itemBodyElements.flatMap((element) => {
      if ("interaction" in element) return [element.interaction];
      if ("inline" in element) {
        return element.inline.filter(
          (part): part is QtiInteraction => typeof part !== "string",
        );
      }
      return [];
    });
  }

  public getResponseDeclarations(): ResponseDeclaration[] {
    return Array.from(this.responseDeclarations.values());
  }

  public getOutcomeDeclarations(): OutcomeDeclaration[] {
    return Array.from(this.outcomeDeclarations.values());
  }

  public addStimulusRef(stimulusRef: QtiStimulusRef) {
    this.stimulusRefs.push(stimulusRef);
  }

  public getStimulusRefs(): QtiStimulusRef[] {
    return this.stimulusRefs;
  }

  public getItemBodyHtml(): string {
    return this.itemBodyElements
      .filter((element) => "html" in element)
      .map((element) => element.html)
      .join("\n")
      .trim();
  }

  public async addToPackage(pkg: ImsPackage) {
    await pkg.addResource(
      {
        identifier: this.identifier,
        type: getResourceType("item", pkg.version),
      },
      [
        {
          filename: `item-${this.identifier}.xml`,
          data: this.buildXml({ version: pkg.version }),
        },
      ],
    );
  }

  public addToTest(test: QtiTest) {
    test.addItemReference(this.identifier, `item-${this.identifier}.xml`);
  }

  public addItemBodyFromHtml(html: string) {
    this.itemBodyElements.push({ html });
  }

  public addInteraction(interaction: QtiInteraction) {
    this.itemBodyElements.push({ interaction });
  }

  public addResponseDeclaration(
    responseDeclaration: ResponseDeclaration = {
      identifier: "RESPONSE",
      cardinality: "single",
      baseType: "string",
    },
  ) {
    if (
      responseDeclaration.correctResponse &&
      responseDeclaration.correctResponse?.length > 1 &&
      responseDeclaration.cardinality === "single"
    ) {
      throw new Error(
        `Cannot add multiple correct responses to a single cardinality response declaration (${responseDeclaration.identifier}).`,
      );
    }

    this.responseDeclarations.set(
      responseDeclaration.identifier,
      responseDeclaration,
    );
  }

  public addResponseProcessing(template: ResponseProcessingTemplate) {
    this.responseProcessing = template;
  }

  /**
   * Scores the item as the sum of the mapped values of several responses,
   * e.g. one per gap in a text. Each response needs a `mapping`.
   */
  public addSummedMapResponseProcessing(responseIdentifiers: string[]) {
    this.responseProcessing = null;
    this.summedMappedResponses = responseIdentifiers;
  }

  /** Adds a paragraph of HTML with inline interactions, e.g. gaps in a text. */
  public addInlineContent(parts: (string | QtiInteraction)[]) {
    this.itemBodyElements.push({ inline: parts });
  }

  public addOutcomeDeclaration(
    outcomeDeclaration: OutcomeDeclaration = {
      identifier: "SCORE",
      cardinality: "single",
      baseType: "float",
      defaultValue: 0,
    },
  ) {
    this.outcomeDeclarations.set(
      outcomeDeclaration.identifier,
      outcomeDeclaration,
    );
  }
}
