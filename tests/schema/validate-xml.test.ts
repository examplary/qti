import { describe, expect, test } from "vitest";

import { validateQtiXml } from "./validate-xml";
import {
  ChoiceInteraction,
  ExtendedTextInteraction,
  ImsManifest,
  ImsManifestResourceType,
  QtiAssessmentSection,
  QtiItem,
  QtiTest,
  QtiTestPart,
  QtiVersion,
  ResponseProcessingTemplate,
  TextEntryInteraction,
} from "../../src";

/**
 * Schema validation tests: do the documents the builders generate actually
 * conform to the official 1EdTech QTI / IMS Content Package XSDs?
 *
 * The first run downloads each root schema and its full import closure
 * (~19MB, cached under node_modules/.schema_cache for subsequent runs), and libxml2
 * (via xmllint-wasm) compiles the QTI 3.0 ASI schema fresh per validation, so
 * these tests are slower than the rest of the suite.
 */

// Compiling the ~18MB QTI 3.0 ASI schema takes a few seconds per validation,
// and the very first run also downloads the schema closure over the network.
const TIMEOUT = 60_000;

/** Asserts a document is schema-valid, surfacing any errors in the message. */
async function expectValid(
  xml: string,
  options?: Parameters<typeof validateQtiXml>[1],
): Promise<void> {
  const result = await validateQtiXml(xml, options);
  expect(
    result.valid,
    `Expected valid ${result.version} ${result.kind} document, got:\n${result.errors.join("\n")}`,
  ).toBe(true);
}

const VERSIONS = [QtiVersion.v3p0, QtiVersion.v2p1] as const;

describe.each(VERSIONS)("QTI %s assessment items", (version) => {
  test(
    "text-entry interaction item",
    async () => {
      const item = new QtiItem({
        identifier: "text-entry-item",
        title: "Arithmetic",
        timeDependent: false,
      });
      item.addResponseDeclaration({
        identifier: "RESPONSE",
        cardinality: "single",
        baseType: "string",
        correctResponse: ["4"],
      });
      item.addItemBodyFromHtml("<p>What is 2 + 2?</p>");
      item.addInteraction(
        new TextEntryInteraction({ responseIdentifier: "RESPONSE" }),
      );
      item.addResponseProcessing(ResponseProcessingTemplate.MatchCorrect);

      await expectValid(item.buildXml({ version }));
    },
    TIMEOUT,
  );

  test(
    "choice interaction item",
    async () => {
      const item = new QtiItem({
        identifier: "choice-item",
        title: "Capitals",
        timeDependent: false,
      });
      item.addResponseDeclaration({
        identifier: "RESPONSE",
        cardinality: "single",
        baseType: "identifier",
        correctResponse: ["A"],
      });
      item.addItemBodyFromHtml("<p>What is the capital of France?</p>");
      item.addInteraction(
        new ChoiceInteraction({
          responseIdentifier: "RESPONSE",
          maxChoices: 1,
          prompt: "Select the correct answer",
          choices: [
            { identifier: "A", content: "Paris" },
            { identifier: "B", content: "Lyon" },
            { identifier: "C", content: "Marseille" },
          ],
        }),
      );
      item.addResponseProcessing(ResponseProcessingTemplate.MatchCorrect);

      await expectValid(item.buildXml({ version }));
    },
    TIMEOUT,
  );

  test(
    "extended-text interaction item",
    async () => {
      const item = new QtiItem({
        identifier: "essay-item",
        title: "Essay",
        timeDependent: false,
      });
      item.addResponseDeclaration({
        identifier: "RESPONSE",
        cardinality: "single",
        baseType: "string",
      });
      item.addItemBodyFromHtml("<p>Discuss the causes of the war.</p>");
      item.addInteraction(
        new ExtendedTextInteraction({ responseIdentifier: "RESPONSE" }),
      );

      await expectValid(item.buildXml({ version }));
    },
    TIMEOUT,
  );
});

describe.each(VERSIONS)("QTI %s extension attributes", (version) => {
  test(
    "item with tool info and extension attributes",
    async () => {
      const item = new QtiItem({
        identifier: "extended-item",
        title: "Extended",
        timeDependent: false,
        toolName: "Tool",
        toolVersion: "2.0",
      });
      item.registerNamespace("ext", "https://example.com/qti-ext");
      item.addNamespacedAttribute("ext", "settings", '{"a":1}');
      item.addItemBodyFromHtml("<p>Read this.</p>");

      const xml = item.buildXml({ version });
      expect(xml.includes('ext:settings="')).toBe(version === QtiVersion.v3p0);
      await expectValid(xml);
    },
    TIMEOUT,
  );

  test(
    "test with tool info and extension attributes",
    async () => {
      const qtiTest = new QtiTest({
        identifier: "extended-test",
        title: "Extended Test",
        toolName: "Tool",
        toolVersion: "2.0",
      });
      qtiTest.registerNamespace("ext", "https://example.com/qti-ext");
      qtiTest.addNamespacedAttribute("ext", "source", "exam_1");
      const part = new QtiTestPart({ identifier: "PART-1" });
      const section = new QtiAssessmentSection({
        identifier: "SEC-1",
        title: "Section 1",
        visible: true,
        keepTogether: false,
      });
      section.addItemReference("extended-item", "extended-item.xml");
      part.addSection(section);
      qtiTest.addTestPart(part);

      await expectValid(qtiTest.buildXml({ version }));
    },
    TIMEOUT,
  );
});

describe.each(VERSIONS)("QTI %s assessment tests", (version) => {
  test(
    "test with a part, section and item reference",
    async () => {
      const qtiTest = new QtiTest({
        identifier: "sample-test",
        title: "Sample Test",
        language: "en",
      });
      const part = new QtiTestPart({
        identifier: "PART-1",
        navigationMode: "linear",
        submissionMode: "individual",
      });
      const section = new QtiAssessmentSection({
        identifier: "SEC-1",
        title: "Section 1",
        visible: true,
      });
      section.addItemReference("choice-item", "choice-item.xml");
      part.addSection(section);
      qtiTest.addTestPart(part);

      await expectValid(qtiTest.buildXml({ version }));
    },
    TIMEOUT,
  );
});

describe.each(VERSIONS)("QTI %s IMS manifests", (version) => {
  test(
    "manifest with a single item resource",
    async () => {
      const manifest = new ImsManifest({
        identifier: "sample-package",
        title: "Sample Package",
        language: "en",
        version,
      });
      manifest.addResource({
        identifier: "choice-item",
        type:
          version === QtiVersion.v3p0
            ? ImsManifestResourceType.imsqti_item_xmlv3p0
            : ImsManifestResourceType.imsqti_item_xmlv2p1,
        href: "choice-item.xml",
        files: [{ href: "choice-item.xml" }],
      });

      await expectValid(manifest.buildXml(), { version });
    },
    TIMEOUT,
  );
});
