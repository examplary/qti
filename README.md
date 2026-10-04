# @examplary/qti

[![npm version](https://img.shields.io/npm/v/@examplary/qti.svg)](https://www.npmjs.com/package/@examplary/qti)
[![CI](https://github.com/examplary-ai/qti/actions/workflows/ci.yml/badge.svg)](https://github.com/examplary-ai/qti/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

TypeScript utilities for generating and parsing [QTI](https://www.1edtech.org/standards/qti)
3.0 and 2.1 assessment packages, including IMS content package manifests and
QTI test/item XML.

Built and maintained by [Examplary AI](https://examplary.ai), the AI-powered test and practice platform.

## Features

- Build IMS Content Packages containing QTI tests and items
- High-level, typed builders for items, tests, sections, interactions and response processing
- Parse QTI packages (ZIP files) and XML strings
- Supports both **QTI 3.0** (default) and **QTI 2.1**, with automatic version detection on parse

## Installation

```bash
npm install @examplary/qti
# or
yarn add @examplary/qti
```

## Usage

### Building QTI assessments

By default, packages are created in QTI 3.0 format:

```ts
import {
  QtiTest,
  QtiItem,
  ImsPackage,
  TextEntryInteraction,
  ResponseProcessingTemplate,
} from "@examplary/qti";

// Build a test with one question
const test = new QtiTest({
  identifier: "my-test",
  title: "My Test",
  language: "en",
});

const item = new QtiItem({
  identifier: "item-1",
  title: "Sample Question",
});

item.addResponseDeclaration({
  identifier: "RESPONSE",
  correctResponse: ["4"],
});

item.addItemBodyFromHtml("<p>What is 2 + 2?</p>");
item.addInteraction(
  new TextEntryInteraction({ responseIdentifier: "RESPONSE" }),
);

item.addResponseProcessing(ResponseProcessingTemplate.MatchCorrect);

item.addToTest(test);

// Create a package
const pkg = new ImsPackage({
  identifier: "my-package",
  title: "My Package",
  language: "en",
});

item.addToPackage(pkg);
test.addToPackage(pkg);

// Get the package as a ZIP
const zip = await pkg.generateZip();
```

### Creating QTI 2.1 packages

To create a QTI 2.1 package instead, specify the version when creating the package:

```ts
import { ImsPackage, QtiVersion } from "@examplary/qti";

const pkg = new ImsPackage({
  identifier: "my-package",
  title: "My Package",
  language: "en",
  version: QtiVersion.v2p1,
});

// Items and tests added to this package will automatically
// generate QTI 2.1 compliant XML
item.addToPackage(pkg);
test.addToPackage(pkg);
```

You can also generate XML in a specific version directly:

```ts
const qti21Xml = item.buildXml({ version: QtiVersion.v2p1 });
const qti30Xml = item.buildXml({ version: QtiVersion.v3p0 }); // default
```

### Parsing QTI assessments

The library supports parsing both QTI 3.0 and 2.1 packages. The version is auto-detected:

```ts
import {
  QtiItem,
  ImsPackage,
  ImsManifestResourceType,
  QtiVersion,
} from "@examplary/qti";
import { readFile } from "fs/promises";

const contents = await readFile("./example-qti-package.zip");
const pkg = await ImsPackage.fromZip(contents);

console.log("Package version:", pkg.version); // QtiVersion.v3p0 or QtiVersion.v2p1

const itemResources = pkg.manifest.getResourcesOfType(
  pkg.version === QtiVersion.v2p1
    ? ImsManifestResourceType.imsqti_item_xmlv2p1
    : ImsManifestResourceType.imsqti_item_xmlv3p0,
);

for (const resource of itemResources) {
  const xml = await pkg.getResourceContentsString(resource.identifier);
  const item = QtiItem.fromXmlString(xml!); // auto-detects version

  console.log("Question title:", item.title);
  console.log("Interactions:", item.getInteractions());
}
```

Tests parse the same way. Sections keep their item references and nested sections in order:

```ts
const test = QtiTest.fromXmlString(testXml); // auto-detects version

for (const part of test.getTestParts()) {
  for (const section of part.getSections()) {
    console.log(section.title, section.getItemReferences());
    console.log("Rubric blocks:", section.getRubricBlocks()); // { view, use, html }
    console.log("Nested sections:", section.getSections());
  }
}
```

## Shared stimuli

QTI 3.0 items can share content, like a reading passage, through a stimulus:

```ts
const item = QtiItem.fromXmlString(itemXml);

for (const ref of item.getStimulusRefs()) {
  // ref.href is relative to the item file
  const stimulus = QtiStimulus.fromXmlString(stimulusXml);
  console.log(stimulus.title, stimulus.html);
}

// Items can also XInclude a file directly, often a plain fragment of body content:
// getIncludedHrefs(item.getItemBodyHtml()) lists those, and
// QtiStimulus.fromIncludedXmlString() reads stimuli and fragments alike

// Put stimuli where the item body asks for them (`data-stimulus-idref` or an
// XInclude of the stimulus file); `placed` tells you which ones were placed
const { html, placed } = replaceStimulusPlacements(
  item.getItemBodyHtml(),
  item.getStimulusRefs(),
  (ref) => `<aside>${ref.title}</aside>`,
);
```

Exporting works the other way around: `new QtiStimulus({ identifier, title, html })`,
`stimulus.addToPackage(pkg)` and `item.addStimulusRef({ identifier, href: stimulus.filename })`.

## Development

```bash
corepack enable
yarn install
yarn test
yarn build
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for more details.

## License

[MIT](./LICENSE) © [Examplary AI](https://examplary.ai)

Some test fixtures under `tests/stubs/` are derived from the
[1EdTech QTI examples](https://github.com/1EdTech/qti-examples); see
`tests/stubs/LICENSE.md` for attribution.
