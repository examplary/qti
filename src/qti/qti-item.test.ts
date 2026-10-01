import { readFile } from "node:fs/promises";

import { describe, expect, test } from "vitest";

import { ChoiceInteraction, TextEntryInteraction } from "./interactions";
import { QtiItem, ResponseProcessingTemplate } from "./qti-item";
import { QtiVersion } from "./types";

describe("QtiItem", () => {
  test("it creates a QTI item", () => {
    const item = new QtiItem();
    expect(item).toBeDefined();
  });

  test("it builds XML with correct root element", () => {
    const item = new QtiItem({ identifier: "test-item" });
    item.addItemBodyFromHtml("<p>This is a test item.</p>");

    const xml = item.buildXml();

    expect(xml).toContain("qti-assessment-item");
    expect(xml).toContain("test-item");
  });

  test("it includes item body content", () => {
    const item = new QtiItem({ identifier: "test-item" });
    item.addItemBodyFromHtml("<p>Question text here</p>");

    const xml = item.buildXml();

    expect(xml).toContain("qti-item-body");
    expect(xml).toContain("Question text here");
  });

  test("it always emits the required time-dependent attribute", () => {
    const item = new QtiItem({ identifier: "test-item" });
    item.addItemBodyFromHtml("<p>Body</p>");

    expect(item.buildXml()).toContain('time-dependent="false"');
  });

  test("it wraps inline interactions in a block element", () => {
    const item = new QtiItem({ identifier: "test-item" });
    item.addItemBodyFromHtml("<p>What is 2 + 2?</p>");
    item.addInteraction(
      new TextEntryInteraction({ responseIdentifier: "RESPONSE" }),
    );

    const xml = item.buildXml();

    // Inline interaction must be nested in a <p>, not a direct child of the body.
    expect(xml).toMatch(/<p>\s*<qti-text-entry-interaction[^>]*\/>\s*<\/p>/);
  });

  test("it emits qti-prompt before the choices", () => {
    const item = new QtiItem({ identifier: "test-item" });
    item.addInteraction(
      new ChoiceInteraction({
        responseIdentifier: "RESPONSE",
        prompt: "Pick one",
        choices: [
          { identifier: "A", content: "Apple" },
          { identifier: "B", content: "Banana" },
        ],
      }),
    );

    const xml = item.buildXml();

    expect(xml.indexOf("qti-prompt")).toBeLessThan(
      xml.indexOf("qti-simple-choice"),
    );
  });

  test("nested inline interactions survive a build -> parse roundtrip", () => {
    for (const version of [QtiVersion.v3p0, QtiVersion.v2p1]) {
      const item = new QtiItem({ identifier: "test-item" });
      item.addItemBodyFromHtml("<p>2 + 2?</p>");
      item.addInteraction(
        new TextEntryInteraction({
          responseIdentifier: "RESPONSE",
          expectedLength: 3,
        }),
      );

      const parsed = QtiItem.fromXmlString(item.buildXml({ version }));
      const interactions = parsed.getInteractions();

      expect(interactions).toHaveLength(1);
      expect(interactions[0]).toBeInstanceOf(TextEntryInteraction);
      expect(interactions[0].responseIdentifier).toBe("RESPONSE");
    }
  });
});

describe("QtiItem.fromXmlString", () => {
  test("it parses a basic QTI item", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <qti-assessment-item identifier="item-123" title="Sample Item" label="Q1" toolName="My Tool">
        <qti-item-body></qti-item-body>
      </qti-assessment-item>`;

    const item = QtiItem.fromXmlString(xml);

    expect(item.identifier).toBe("item-123");
    expect(item.title).toBe("Sample Item");
    expect(item.label).toBe("Q1");
    expect(item.toolName).toBe("My Tool");
  });

  test("it parses response declarations with correct responses", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <qti-assessment-item identifier="item-123">
        <qti-response-declaration identifier="RESPONSE" cardinality="single" base-type="identifier">
          <qti-correct-response>
            <qti-value>choice-A</qti-value>
          </qti-correct-response>
        </qti-response-declaration>
        <qti-item-body></qti-item-body>
      </qti-assessment-item>`;

    const item = QtiItem.fromXmlString(xml);
    const generatedXml = item.buildXml();

    expect(generatedXml).toContain('identifier="RESPONSE"');
    expect(generatedXml).toContain('base-type="identifier"');
    expect(generatedXml).toContain("choice-A");
  });

  test("it parses outcome declarations", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <qti-assessment-item identifier="item-123">
        <qti-outcome-declaration identifier="SCORE" cardinality="single" base-type="float">
          <qti-default-value><qti-value>0</qti-value></qti-default-value>
        </qti-outcome-declaration>
        <qti-item-body></qti-item-body>
      </qti-assessment-item>`;

    const item = QtiItem.fromXmlString(xml);
    const generatedXml = item.buildXml();

    expect(generatedXml).toContain('identifier="SCORE"');
    expect(generatedXml).toContain('base-type="float"');
  });

  test("it parses item body HTML content", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <qti-assessment-item identifier="item-123">
        <qti-item-body>
          <p>What is the capital of France?</p>
        </qti-item-body>
      </qti-assessment-item>`;

    const item = QtiItem.fromXmlString(xml);
    const generatedXml = item.buildXml();

    expect(generatedXml).toContain("What is the capital of France?");
  });

  test("it parses response processing template", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <qti-assessment-item identifier="item-123">
        <qti-item-body></qti-item-body>
        <qti-response-processing template="${ResponseProcessingTemplate.MatchCorrect}"/>
      </qti-assessment-item>`;

    const item = QtiItem.fromXmlString(xml);
    const generatedXml = item.buildXml();

    expect(generatedXml).toContain(ResponseProcessingTemplate.MatchCorrect);
  });

  test("it throws on missing root element", () => {
    const xml = `<?xml version="1.0"?><invalid-element/>`;

    expect(() => QtiItem.fromXmlString(xml)).toThrow();
  });

  test("it throws on invalid XML", () => {
    expect(() => QtiItem.fromXmlString("not xml at all")).toThrow();
  });

  test("roundtrip: buildXml -> fromXmlString produces equivalent item", () => {
    const original = new QtiItem({
      identifier: "roundtrip-item",
      title: "Roundtrip Item",
      label: "RT1",
      language: "en",
    });
    original.addResponseDeclaration({
      identifier: "RESPONSE",
      cardinality: "single",
      baseType: "identifier",
      correctResponse: ["A"],
    });
    original.addItemBodyFromHtml("<p>Test question</p>");
    original.addResponseProcessing(ResponseProcessingTemplate.MatchCorrect);

    const xml = original.buildXml();
    const parsed = QtiItem.fromXmlString(xml);

    expect(parsed.identifier).toBe(original.identifier);
    expect(parsed.title).toBe(original.title);
    expect(parsed.label).toBe(original.label);
    expect(parsed.language).toBe(original.language);
  });

  test("parse single item", async () => {
    const xml = await readFile(
      new URL(
        "../../tests/stubs/cito-qti-assessment-item.xml",
        import.meta.url,
      ),
      "utf-8",
    );
    const item = QtiItem.fromXmlString(xml);

    expect(item.getInteractions().length).toBe(1);
    expect(item.getItemBodyHtml()).toContain(
      "Zevenblad is een plant die in Nederland veel voorkomt.",
    );

    const choice = item.getInteractions()[0] as ChoiceInteraction;
    expect(choice.choices?.length).toBe(3);
    expect(choice.choices?.[1].content).toBe("alleen ongeslachtelijk");
  });
});

describe("QtiItem attributes", () => {
  test("it writes tool info in kebab-case for QTI 3.0 and camelCase for QTI 2.1", () => {
    const item = new QtiItem({ identifier: "i", toolName: "Tool" });
    expect(item.buildXml({ version: QtiVersion.v3p0 })).toContain(
      'tool-name="Tool"',
    );
    expect(item.buildXml({ version: QtiVersion.v2p1 })).toContain(
      'toolName="Tool"',
    );
  });

  test("it round-trips extension attributes", () => {
    const item = new QtiItem({ identifier: "i", toolName: "Tool" });
    item.registerNamespace("ext", "https://example.com/qti-ext");
    item.addNamespacedAttribute("ext", "type", "essay");
    item.addNamespacedAttribute("ext", "settings", '{"a":"<b>"}');
    item.addNamespacedAttribute("ext", "unset", undefined);

    const parsed = QtiItem.fromXmlString(item.buildXml());
    expect(parsed.getNamespacedAttributes("ext")).toEqual({
      type: "essay",
      settings: '{"a":"<b>"}',
    });
    expect(parsed.getNamespacedAttributes("other")).toEqual({});
    expect(parsed.toolName).toBe("Tool");
  });

  test("it still reads the camelCase tool info of older packages", () => {
    const parsed = QtiItem.fromXmlString(
      `<qti-assessment-item identifier="i" toolName="Old" toolVersion="1"/>`,
    );
    expect(parsed.toolName).toBe("Old");
    expect(parsed.toolVersion).toBe("1");
  });
});

describe("QtiItem response mappings", () => {
  test.each([QtiVersion.v3p0, QtiVersion.v2p1])(
    "it writes and parses a mapping in QTI %s",
    (version) => {
      const mapping = {
        defaultValue: 0,
        entries: [
          { mapKey: "7", mappedValue: 1, caseSensitive: true },
          { mapKey: "seven", mappedValue: 0.5, caseSensitive: false },
        ],
      };
      const item = new QtiItem({ identifier: "i" });
      item.addResponseDeclaration({
        identifier: "RESPONSE",
        baseType: "string",
        correctResponse: ["7"],
        mapping,
      });

      const xml = item.buildXml({ version });
      expect(xml).toContain(
        version === QtiVersion.v3p0
          ? '<qti-map-entry map-key="seven" mapped-value="0.5" case-sensitive="false"/>'
          : '<mapEntry mapKey="seven" mappedValue="0.5" caseSensitive="false"/>',
      );

      const [parsed] = QtiItem.fromXmlString(xml).getResponseDeclarations();
      expect(parsed.mapping).toEqual(mapping);
    },
  );
});

describe("QtiItem gap texts", () => {
  test("it puts text and inline interactions in one paragraph", () => {
    const first = new TextEntryInteraction({ responseIdentifier: "R1" });
    const second = new TextEntryInteraction({ responseIdentifier: "R2" });
    const item = new QtiItem({ identifier: "i" });
    item.addInlineContent(["France: ", first, ", Spain: ", second]);
    item.addSummedMapResponseProcessing(["R1", "R2"]);

    const xml = item.buildXml();
    expect(xml.replace(/\s+/g, " ")).toContain(
      '<p> France: <qti-text-entry-interaction response-identifier="R1"/> , Spain: <qti-text-entry-interaction response-identifier="R2"/> </p>',
    );
    expect(xml).toContain('<qti-map-response identifier="R2"/>');
    expect(item.getInteractions()).toEqual([first, second]);
  });
});
