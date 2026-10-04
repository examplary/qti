import { describe, expect, test } from "vitest";

import { ImsManifest, ImsManifestResourceType } from "./ims-manifest";

describe("ImsManifest", () => {
  test("buildXml generates correct XML structure", () => {
    const manifest = new ImsManifest({ identifier: "test-manifest" });

    const xmlString = manifest.buildXml();
    expect(xmlString).toContain('identifier="test-manifest"');
    expect(xmlString).toContain(
      'xmlns="http://www.imsglobal.org/xsd/qti/qtiv3p0/imscp_v1p1"',
    );
    expect(xmlString).toContain("xsi:schemaLocation=");
  });

  test("can add resources", () => {
    const manifest = new ImsManifest();
    manifest.addResource({
      identifier: "res1",
      type: ImsManifestResourceType.imsqti_item_xmlv3p0,
      files: [{ href: "item1.xml" }],
    });

    expect(manifest.getResources().length).toBe(1);
    expect(manifest.getResources()[0].identifier).toBe("res1");

    const xmlString = manifest.buildXml();
    expect(xmlString).toContain('<resource identifier="res1"');
    expect(xmlString).toContain('href="item1.xml"');
  });

  test("resource href is set from first file if not provided", () => {
    const manifest = new ImsManifest();
    manifest.addResource({
      identifier: "res2",
      type: ImsManifestResourceType.imsqti_item_xmlv3p0,
      files: [{ href: "item2.xml" }],
    });

    expect(manifest.getResources()[0].href).toBe("item2.xml");

    const xmlString = manifest.buildXml();
    expect(xmlString).toContain(
      '<resource identifier="res2" type="imsqti_item_xmlv3p0" href="item2.xml">',
    );
  });

  test("two resources with same identifier cause override", () => {
    const manifest = new ImsManifest();
    manifest.addResource({
      identifier: "res3",
      type: ImsManifestResourceType.imsqti_item_xmlv3p0,
      files: [{ href: "item3a.xml" }],
    });
    manifest.addResource({
      identifier: "res3",
      type: ImsManifestResourceType.imsqti_item_xmlv3p0,
      files: [{ href: "item3b.xml" }],
    });

    const xmlString = manifest.buildXml();
    expect(xmlString).toContain(
      '<resource identifier="res3" type="imsqti_item_xmlv3p0" href="item3b.xml">',
    );
    expect(xmlString).not.toContain(
      '<resource identifier="res3" type="imsqti_item_xmlv3p0" href="item3a.xml">',
    );
  });

  test("parses a manifest with namespace-prefixed elements", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <imscp:manifest xmlns:imscp="http://www.imsglobal.org/xsd/qti/qtiv3p0/imscp_v1p1" identifier="manifestID">
        <imscp:organizations/>
        <imscp:resources>
          <imscp:resource identifier="test-1" type="imsqti_test_xmlv3p0" href="test-1.xml">
            <imscp:metadata><imscp:schema>QTI Package</imscp:schema></imscp:metadata>
            <imscp:file href="test-1.xml"/>
            <imscp:dependency identifierref="item-1"/>
          </imscp:resource>
          <imscp:resource identifier="item-1" type="imsqti_item_xmlv3p0" href="item-1.xml">
            <imscp:file href="item-1.xml"/>
          </imscp:resource>
        </imscp:resources>
      </imscp:manifest>`;

    const manifest = ImsManifest.fromXmlString(xml);

    expect(manifest.getResources()).toMatchObject([
      {
        identifier: "test-1",
        type: ImsManifestResourceType.imsqti_test_xmlv3p0,
        files: [{ href: "test-1.xml" }],
        dependencies: [{ identifierref: "item-1" }],
      },
      {
        identifier: "item-1",
        type: ImsManifestResourceType.imsqti_item_xmlv3p0,
        files: [{ href: "item-1.xml" }],
      },
    ]);
  });
});
