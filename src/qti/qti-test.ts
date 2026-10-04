import { load } from "cheerio";
import type { AnyNode } from "domhandler";
import { create } from "xmlbuilder2/lib/index.js";
import { XMLBuilder } from "xmlbuilder2/lib/interfaces";

import { QtiAssessmentSection } from "./qti-assessment-section";
import { QtiElement } from "./qti-element";
import { BuildXmlOptions, OutcomeDeclaration } from "./qti-item";
import { QtiTestPart } from "./qti-test-part";
import {
  QtiBaseType,
  QtiCardinality,
  QtiVersion,
  QTI_VERSION_CONFIG,
} from "./types";
import { getResourceType } from "../ims/ims-manifest";
import { ImsPackage } from "../ims/ims-package";
import { appendHtmlFragment, extractHtmlFragment } from "../utils/html";
import { toElementName, toAttributeName } from "../utils/version";

type QtiTestOptions = {
  identifier?: string;
  title?: string;
  language?: string;
  toolName?: string;
  toolVersion?: string;
  addDefaultOutcomes?: boolean;
};

export class QtiTest extends QtiElement {
  public identifier: string;
  public title?: string;
  public language?: string;
  public toolName?: string;
  public toolVersion?: string;

  protected outcomeDeclarations: Map<string, OutcomeDeclaration> = new Map();
  protected testParts: QtiTestPart[] = [];

  constructor(options?: QtiTestOptions) {
    super();
    this.identifier = options?.identifier || "test-" + Date.now();
    this.title = options?.title;
    this.language = options?.language;
    this.toolName = options?.toolName || "Examplary QTI Module";
    this.toolVersion = options?.toolVersion || "1.0.0";

    if (options?.addDefaultOutcomes !== false) {
      this.addOutcomeDeclaration({
        identifier: "SCORE",
        cardinality: "single",
        baseType: "float",
        defaultValue: 0,
      });
      this.addOutcomeDeclaration({
        identifier: "MAX_SCORE",
        cardinality: "single",
        baseType: "float",
        defaultValue: 0,
      });
    }
  }

  public static fromXmlString(xml: string): QtiTest {
    const $ = load(xml, { xmlMode: true });
    const version = $("assessmentTest").length
      ? QtiVersion.v2p1
      : QtiVersion.v3p0;
    const el = (name: string) => toElementName(name, version);
    const attr = (name: string) => toAttributeName(name, version);
    const root = $(el("qti-assessment-test"));
    if (!root.length) throw new Error("Missing qti-assessment-test element");

    const test = new QtiTest({
      identifier: root.attr("identifier"),
      title: root.attr("title"),
      language: root.attr("xml:lang"),
      // Older packages wrote these in camelCase
      toolName: root.attr("tool-name") ?? root.attr("toolName"),
      toolVersion: root.attr("tool-version") ?? root.attr("toolVersion"),
      addDefaultOutcomes: false,
    });
    test.readNamespacedAttributes(root.attr() ?? {});

    root.find(el("qti-outcome-declaration")).each((_, outcome) => {
      const $out = $(outcome);
      const outcomeId = $out.attr("identifier");
      if (!outcomeId) return;

      const defaultValueNode = $out.find(el("qti-default-value"));
      const valueNode = defaultValueNode.length
        ? $(defaultValueNode).find(el("qti-value"))
        : undefined;

      let defaultValue: string | number | undefined = valueNode?.length
        ? valueNode.text()
        : undefined;
      const cardinality = ($out.attr("cardinality") ||
        "single") as QtiCardinality;
      const baseType = ($out.attr(attr("base-type")) ||
        "string") as QtiBaseType;
      if (defaultValue) {
        if (baseType === "float" || baseType === "integer") {
          defaultValue = Number(defaultValue);
        }
      }

      test.addOutcomeDeclaration({
        identifier: outcomeId,
        cardinality,
        baseType,
        defaultValue,
      });
    });

    const parseSection = (node: AnyNode) => {
      const $section = $(node);
      const section = new QtiAssessmentSection({
        identifier: $section.attr("identifier") ?? "",
        title: $section.attr("title") ?? "",
        visible: $section.attr("visible") !== "false",
        class: $section.attr("class"),
        fixed: $section.attr("fixed") === "true",
        required: $section.attr("required") === "true",
        keepTogether:
          ($section.attr("keep-together") ?? $section.attr("keepTogether")) !==
          "false",
      });

      $section.children(el("qti-rubric-block")).each((_, block) => {
        const $block = $(block);
        // QTI 3 wraps the content in a qti-content-body, QTI 2.1 doesn't
        const $body = $block.children(el("qti-content-body"));
        section.addRubricBlock({
          view: ($block.attr("view") ?? "").split(/\s+/).filter(Boolean),
          use: $block.attr("use"),
          html: extractHtmlFragment($body.length ? $body : $block),
        });
      });

      $section
        .children(
          `${el("qti-assessment-item-ref")}, ${el("qti-assessment-section")}`,
        )
        .each((_, child) => {
          const $child = $(child);
          if ($child.is(el("qti-assessment-section"))) {
            section.addSection(parseSection(child));
            return;
          }

          const itemId = $child.attr("identifier");
          const href = $child.attr("href");
          if (itemId && href) section.addItemReference(itemId, href);
        });

      return section;
    };

    root.children(el("qti-test-part")).each((_, part) => {
      const $part = $(part);
      const testPart = new QtiTestPart({
        identifier: $part.attr("identifier") ?? "",
        title: $part.attr("title"),
        class: $part.attr("class"),
        navigationMode: ($part.attr(attr("navigation-mode")) || "linear") as
          "linear" | "nonlinear",
        submissionMode: ($part.attr(attr("submission-mode")) ||
          "simultaneous") as "individual" | "simultaneous",
      });

      $part.children(el("qti-assessment-section")).each((_, section) => {
        testPart.addSection(parseSection(section));
      });

      test.addTestPart(testPart);
    });

    return test;
  }

  public buildXml(options?: BuildXmlOptions): string {
    const version = options?.version ?? QtiVersion.v3p0;
    const config = QTI_VERSION_CONFIG[version];
    const el = (name: string) => toElementName(name, version);
    const attr = (name: string) => toAttributeName(name, version);

    const test = create({ version: "1.0", encoding: "UTF-8" }).ele(
      el("qti-assessment-test"),
      {
        xmlns: config.namespace,
        "xmlns:m": "http://www.w3.org/1998/Math/MathML",
        "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
        "xsi:schemaLocation": config.schemaLocation,
        identifier: this.identifier,
        title: this.title,
        [attr("tool-name")]: this.toolName,
        [attr("tool-version")]: this.toolVersion,
        // The QTI 2.1 assessmentTest element does not permit xml:lang.
        "xml:lang": version === QtiVersion.v2p1 ? undefined : this.language,
      },
    );

    // Extensions
    this.appendNamespacesAndElements(test, version);

    // Outcome declarations
    for (const outcomeDeclaration of this.outcomeDeclarations.values()) {
      const outcome = test.ele(el("qti-outcome-declaration"), {
        [attr("base-type")]: outcomeDeclaration.baseType,
        cardinality: outcomeDeclaration.cardinality,
        identifier: outcomeDeclaration.identifier,
      });
      if (outcomeDeclaration.defaultValue !== undefined) {
        outcome
          .ele(el("qti-default-value"))
          .ele(el("qti-value"))
          .txt(outcomeDeclaration.defaultValue.toString());
      }
    }

    const appendSection = (
      parent: XMLBuilder,
      section: QtiAssessmentSection,
    ) => {
      const sec = parent.ele(el("qti-assessment-section"), {
        identifier: section.identifier,
        title: section.title,
        class: section.class,
        visible: section.visible ? "true" : "false",
        fixed: section.fixed ? "true" : "false",
        required: section.required ? "true" : "false",
        [attr("keep-together")]: section.keepTogether ? "true" : "false",
      });

      for (const rubricBlock of section.getRubricBlocks()) {
        const block = sec.ele(el("qti-rubric-block"), {
          view: rubricBlock.view.join(" ") || "candidate",
          use: rubricBlock.use,
        });
        appendHtmlFragment(
          rubricBlock.html,
          version === QtiVersion.v2p1 ? block : block.ele("qti-content-body"),
        );
      }

      for (const child of section.getChildren()) {
        if (child instanceof QtiAssessmentSection) {
          appendSection(sec, child);
        } else {
          sec.ele(el("qti-assessment-item-ref"), {
            identifier: child.itemIdentifier,
            href: child.href,
          });
        }
      }
    };

    // Parts
    for (const testPart of this.testParts) {
      const part = test.ele(el("qti-test-part"), {
        identifier: testPart.identifier,
        title: testPart.title,
        [attr("navigation-mode")]: testPart.navigationMode,
        [attr("submission-mode")]: testPart.submissionMode,
        class: testPart.class,
      });

      for (const section of testPart.getSections()) {
        appendSection(part, section);
      }
    }

    // Outcome processing
    const outcomeProcessing = test.ele(el("qti-outcome-processing"));
    for (const outcomeDeclaration of this.outcomeDeclarations.values()) {
      outcomeProcessing
        .ele(el("qti-set-outcome-value"), {
          identifier: outcomeDeclaration.identifier,
        })
        .ele(el("qti-sum"))
        .ele(el("qti-test-variables"), {
          [attr("variable-identifier")]: outcomeDeclaration.identifier,
        });
    }

    return test.end({ prettyPrint: true });
  }

  public async addToPackage(pkg: ImsPackage) {
    await pkg.addResource(
      {
        identifier: this.identifier,
        type: getResourceType("test", pkg.version),
      },
      [
        {
          filename: `test-${this.identifier}.xml`,
          data: this.buildXml({ version: pkg.version }),
        },
      ],
    );
  }

  public addTestPart(testPart: QtiTestPart) {
    this.testParts.push(testPart);
  }

  public getTestParts(): QtiTestPart[] {
    return this.testParts;
  }

  /**
   * Convenience method to add an item reference to the first section of the first test part.
   */
  public addItemReference(itemIdentifier: string, href: string): void {
    if (!this.testParts.length) {
      this.addTestPart(new QtiTestPart({ identifier: "PART-1" }));
    }
    if (!this.testParts[0].getSections().length) {
      this.testParts[0].addSection(
        new QtiAssessmentSection({
          identifier: "SECTION-1",
          title: "Section 1",
          visible: true,
        }),
      );
    }

    this.testParts[0].getSections()[0].addItemReference(itemIdentifier, href);
  }

  public addOutcomeDeclaration(outcomeDeclaration: OutcomeDeclaration) {
    this.outcomeDeclarations.set(
      outcomeDeclaration.identifier,
      outcomeDeclaration,
    );
  }
}
