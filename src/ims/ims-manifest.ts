import { load } from "cheerio";
import { create } from "xmlbuilder2";

import { QtiVersion, QTI_VERSION_CONFIG } from "../qti/types";
import { detectVersionFromResourceType } from "../utils/version";

export enum ImsManifestResourceType {
  // QTI 3 AssessmentTest
  imsqti_test_xmlv3p0 = "imsqti_test_xmlv3p0",
  // QTI 3 AssessmentSection
  imsqti_section_xmlv3p0 = "imsqti_section_xmlv3p0",
  // QTI 3 AssessmentItem
  imsqti_item_xmlv3p0 = "imsqti_item_xmlv3p0",

  // QTI 3 OutcomeDeclaration
  imsqti_outcomes_xmlv3p0 = "imsqti_outcomes_xmlv3p0",
  // QTI 3 ResponseProcessing
  imsqti_responseprocessing_xmlv3p0 = "imsqti_responseprocessing_xmlv3p0",
  // QTI 3 AssessmentStimulus
  imsqti_stimulus_xmlv3p0 = "imsqti_stimulus_xmlv3p0",
  // QTI 3 inclusion (XInclude)
  imsqti_fragment_xmlv3p0 = "imsqti_fragment_xmlv3p0",
  // QTI 3 Response Processing Template
  imsqti_rptemplate_xmlv3p0 = "imsqti_rptemplate_xmlv3p0",

  // QTI 2.1 AssessmentTest
  imsqti_test_xmlv2p1 = "imsqti_test_xmlv2p1",
  // QTI 2.1 AssessmentSection
  imsqti_section_xmlv2p1 = "imsqti_section_xmlv2p1",
  // QTI 2.1 AssessmentItem
  imsqti_item_xmlv2p1 = "imsqti_item_xmlv2p1",

  // Web Content files include any files that are widely supported for delivery over the web.
  // These could include HTML files, images, audio, video, MS Office, PDF, Flash etc.
  webcontent = "webcontent",

  // 1EdTech LTI 1.1 resource
  imslti_xmlv1p1 = "imslti_xmlv1p1",
  // 1EdTech LTI 1.3 resource
  imsltia_xmlv1p0 = "imsltia_xmlv1p0",

  // CSS 2.0 file
  css2 = "css2",
  // CSS 3.0 file
  css3 = "css3",
  // W3C Pronunciation Lexicon Specification files (for content accessibility)
  pls = "pls",
  // Proprietary file (enables extension)
  extension = "extension",

  // A collection of files used exclusively by an individual Learning Application Object.
  // A Learning Application Object is a directory structure used to group together all the files (or file references)
  // that are used to deliver a single instance of one of the following resource types: web content, web link,
  // discussion topic, assessment or intra-package reference.
  "associatedcontent/learning-application-resource" = "associatedcontent/learning-application-resource",

  // Schema (XSD). Allows for packaging the XSD files needed to validate the files in the package as part of the package.
  controlfile = "controlfile",

  // External IMS metadata
  "resourcemetadata/xml" = "resourcemetadata/xml",
  // External non-IMS metadata
  "resourceextmetadata/xml" = "resourceextmetadata/xml",

  // QTI 3 Usage Data (may need to pass to a CAT engine)
  "qtiusagedata/xml" = "qtiusagedata/xml",
}

export type ImsManifestResource = {
  identifier: string;
  type: ImsManifestResourceType;
  href?: string;
  files: ImsManifestFile[];
  dependencies?: ImsManifestDependency[];
  metadata?: any;
};

export type ImsManifestDependency = {
  identifierref: string;
};

export type ImsManifestFile = {
  href: string;
};

export type ImsManifestOptions = {
  identifier?: string;
  title?: string;
  language?: string;
  toolName?: string;
  toolVersion?: string;
  version?: QtiVersion;
};

export function getResourceType(
  baseType: "item" | "test" | "section",
  version: QtiVersion,
): ImsManifestResourceType {
  const types = {
    item: {
      [QtiVersion.v3p0]: ImsManifestResourceType.imsqti_item_xmlv3p0,
      [QtiVersion.v2p1]: ImsManifestResourceType.imsqti_item_xmlv2p1,
    },
    test: {
      [QtiVersion.v3p0]: ImsManifestResourceType.imsqti_test_xmlv3p0,
      [QtiVersion.v2p1]: ImsManifestResourceType.imsqti_test_xmlv2p1,
    },
    section: {
      [QtiVersion.v3p0]: ImsManifestResourceType.imsqti_section_xmlv3p0,
      [QtiVersion.v2p1]: ImsManifestResourceType.imsqti_section_xmlv2p1,
    },
  };
  return types[baseType][version];
}

export class ImsManifest {
  private resources: Map<string, ImsManifestResource> = new Map();
  public identifier: string;
  public title: string;
  public language: string;
  public toolName: string;
  public toolVersion: string;
  public version: QtiVersion;

  constructor(options?: ImsManifestOptions) {
    this.identifier = options?.identifier || "manifest-" + Date.now();
    this.title = options?.title || "QTI Package";
    this.language = options?.language || "en";
    this.toolName = options?.toolName || "Examplary QTI Module";
    this.toolVersion = options?.toolVersion || "1.0.0";
    this.version = options?.version ?? QtiVersion.v3p0;
    this.resources = new Map();
  }

  public addResource(resource: ImsManifestResource) {
    if (!resource.href && resource.files?.length > 0) {
      resource.href = resource.files[0].href;
    }
    this.resources.set(resource.identifier, resource);
  }

  public getResources(): ImsManifestResource[] {
    return Array.from(this.resources.values());
  }

  public getResourcesOfType(
    type: ImsManifestResourceType,
  ): ImsManifestResource[] {
    return Array.from(this.resources.values()).filter(
      (res) => res.type === type,
    );
  }

  public getResourceByIdentifier(
    identifier: string,
  ): ImsManifestResource | undefined {
    return this.resources.get(identifier);
  }

  public static fromXmlString(xml: string): ImsManifest {
    const $ = load(xml, { xmlMode: true });
    const root = $("manifest");
    if (!root.length) throw new Error("Missing manifest element");

    const resources = root.find("resources");
    if (!resources?.length) {
      throw new Error("Invalid IMS Manifest XML: Missing resources element");
    }

    // Auto-detect version from resource types
    let detectedVersion = QtiVersion.v3p0;
    resources.find("resource").each((_, res) => {
      const type = $(res).attr("type");
      if (type) {
        const version = detectVersionFromResourceType(type);
        if (version) {
          detectedVersion = version;
          return false; // Break after first detection
        }
      }
    });

    const manifest = new ImsManifest({
      identifier: root.attr("identifier"),
      version: detectedVersion,
    });

    resources.find("resource").each((_, res) => {
      const $res = $(res);
      const identifier = $res.attr("identifier");
      const type = $res.attr("type");
      if (!identifier || !type) {
        throw new Error(
          "Invalid IMS Manifest XML: Resource missing identifier or type",
        );
      }
      const href = $res.attr("href");

      const files: ImsManifestFile[] = [];
      $res.find("file").each((_, file) => {
        const $file = $(file);
        const fileHref = $file.attr("href");
        if (fileHref) {
          files.push({ href: fileHref });
        }
      });

      const dependencies: ImsManifestDependency[] = [];
      $res.find("dependency").each((_, dep) => {
        const $dep = $(dep);
        const identifierref = $dep.attr("identifierref");
        if (identifierref) {
          dependencies.push({ identifierref });
        }
      });

      manifest.addResource({
        identifier,
        type: type as ImsManifestResourceType,
        href: href || undefined,
        metadata: $res.find("metadata").first(), // TODO: inconsistent type casting here
        files,
        dependencies: dependencies.length > 0 ? dependencies : undefined,
      });
    });

    return manifest;
  }

  buildXml(): string {
    const config = QTI_VERSION_CONFIG[this.version];
    const qtiVersionLabel =
      this.version === QtiVersion.v3p0 ? "QTIv3.0" : "QTIv2.1";

    const manifest = create({ version: "1.0", encoding: "UTF-8" }).ele(
      "manifest",
      {
        xmlns: config.manifestNamespace,
        "xmlns:lom": "http://ltsc.ieee.org/xsd/LOM",
        "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
        "xmlns:imsqti": config.metadataNamespace,
        "xsi:schemaLocation": config.manifestSchemaLocation,
        identifier: this.identifier,
      },
    );

    // Define metadata
    const metadata = manifest.ele("metadata");
    metadata.ele("schema").txt(config.manifestSchema);
    metadata.ele("schemaversion").txt(config.manifestSchemaVersion);

    const lom = "http://ltsc.ieee.org/xsd/LOM";
    const lomMetadata = metadata.ele(lom, "lom", { xmlns: lom });
    const general = lomMetadata.ele(lom, "general");
    general.ele(lom, "title").ele(lom, "string").txt(this.title);
    general.ele(lom, "language").txt(this.language);

    const metaMeta = lomMetadata.ele(lom, "metaMetadata");
    metaMeta.ele(lom, "metadataschema").txt("LOMv1.0");
    metaMeta.ele(lom, "metadataschema").txt(qtiVersionLabel);
    metaMeta.ele(lom, "language").txt(this.language);

    const ns = config.metadataNamespace;
    const qtiMetadata = lomMetadata.ele(ns, "qtiMetadata", {
      xmlns: ns,
    });
    qtiMetadata.ele(ns, "toolName").txt(this.toolName);
    qtiMetadata.ele(ns, "toolVersion").txt(this.toolVersion);

    // Empty organizations element
    manifest.ele("organizations");

    // Define resources
    const resources = manifest.ele("resources");
    for (const res of this.resources.values()) {
      const resourceEle = resources.ele("resource", {
        identifier: res.identifier,
        type: res.type,
        href: res.href,
      });

      if (res.metadata) {
        const resMetadata = resourceEle.ele("metadata");
        resMetadata.import(res.metadata);
      }

      for (const file of res.files) {
        resourceEle.ele("file", { href: file.href });
      }

      if (res.dependencies) {
        for (const dep of res.dependencies) {
          resourceEle.ele("dependency", {
            identifierref: dep.identifierref,
          });
        }
      }
    }

    return manifest.end({ prettyPrint: true });
  }
}
