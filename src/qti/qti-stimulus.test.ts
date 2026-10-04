import { describe, expect, test } from "vitest";

import { QtiItem } from "./qti-item";
import { QtiStimulus } from "./qti-stimulus";
import { QtiVersion } from "./types";
import { ImsPackage } from "../ims/ims-package";

describe("QtiStimulus", () => {
  test("it parses a stimulus", () => {
    const stimulus = QtiStimulus.fromXmlString(`<?xml version="1.0"?>
      <qti-assessment-stimulus identifier="STIM-1" title="The Thames Barrier" xml:lang="en-GB">
        <qti-stimulus-body><h2>The Thames Barrier</h2><p>London sits on a tidal river.</p></qti-stimulus-body>
      </qti-assessment-stimulus>`);

    expect(stimulus).toMatchObject({
      identifier: "STIM-1",
      title: "The Thames Barrier",
      language: "en-GB",
      html: "<h2>The Thames Barrier</h2><p>London sits on a tidal river.</p>",
    });
  });

  test("it throws without a stimulus element", () => {
    expect(() => QtiStimulus.fromXmlString("<qti-assessment-item/>")).toThrow();
  });

  test("roundtrip: buildXml -> fromXmlString", () => {
    const original = new QtiStimulus({
      identifier: "STIM-1",
      title: "Passage",
      html: "<p>Some text.</p>",
    });

    const parsed = QtiStimulus.fromXmlString(original.buildXml());

    expect(parsed).toEqual(original);
  });

  test("it adds itself to a package as a stimulus resource", async () => {
    const pkg = new ImsPackage({ version: QtiVersion.v3p0 });
    await new QtiStimulus({ identifier: "STIM-1" }).addToPackage(pkg);

    expect(pkg.manifest.getResourceByIdentifier("STIM-1")).toMatchObject({
      type: "imsqti_stimulus_xmlv3p0",
      href: "stimulus-STIM-1.xml",
    });
  });
});

describe("QtiItem stimulus references", () => {
  test("it parses stimulus references", () => {
    const item =
      QtiItem.fromXmlString(`<qti-assessment-item identifier="ITEM-1">
        <qti-assessment-stimulus-ref identifier="STIM-1" href="stimulus.xml" title="Passage"/>
        <qti-item-body><p>Question</p></qti-item-body>
      </qti-assessment-item>`);

    expect(item.getStimulusRefs()).toEqual([
      { identifier: "STIM-1", href: "stimulus.xml", title: "Passage" },
    ]);
  });

  test("roundtrip: stimulus references survive in QTI 3.0 only", () => {
    const item = new QtiItem({ identifier: "ITEM-1" });
    item.addStimulusRef({ identifier: "STIM-1", href: "stimulus.xml" });

    const v3 = QtiItem.fromXmlString(item.buildXml());
    const v21 = QtiItem.fromXmlString(
      item.buildXml({ version: QtiVersion.v2p1 }),
    );

    expect(v3.getStimulusRefs()).toEqual([
      { identifier: "STIM-1", href: "stimulus.xml", title: undefined },
    ]);
    expect(v21.getStimulusRefs()).toEqual([]);
  });
});
