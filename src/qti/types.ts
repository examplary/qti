export enum QtiVersion {
  v3p0 = "3.0",
  v2p1 = "2.1",
}

export type QtiVersionConfig = {
  namespace: string;
  schemaLocation: string;
  responseProcessingTemplates: {
    matchCorrect: string;
    mapResponse: string;
    mapResponsePoint: string;
  };
  manifestNamespace: string;
  manifestSchemaLocation: string;
  metadataNamespace: string;
  schemaVersion: string;
  /** Value for the manifest's <schema> metadata element. */
  manifestSchema: string;
  /** Value for the manifest's <schemaversion> metadata element. */
  manifestSchemaVersion: string;
};

export const QTI_VERSION_CONFIG: Record<QtiVersion, QtiVersionConfig> = {
  [QtiVersion.v3p0]: {
    namespace: "http://www.imsglobal.org/xsd/imsqtiasi_v3p0",
    schemaLocation:
      "http://www.imsglobal.org/xsd/imsqtiasi_v3p0 https://purl.imsglobal.org/spec/qti/v3p0/schema/xsd/imsqti_asiv3p0_v1p0.xsd " +
      "http://www.w3.org/1998/Math/MathML https://purl.imsglobal.org/spec/mathml/v3p0/schema/xsd/mathml3.xsd",
    responseProcessingTemplates: {
      matchCorrect:
        "https://purl.imsglobal.org/spec/qti/v3p0/rptemplates/match_correct.xml",
      mapResponse:
        "https://purl.imsglobal.org/spec/qti/v3p0/rptemplates/map_response.xml",
      mapResponsePoint:
        "https://purl.imsglobal.org/spec/qti/v3p0/rptemplates/map_response_point.xml",
    },
    manifestNamespace: "http://www.imsglobal.org/xsd/qti/qtiv3p0/imscp_v1p1",
    manifestSchemaLocation:
      "http://ltsc.ieee.org/xsd/LOM https://purl.imsglobal.org/spec/md/v1p3/schema/xsd/imsmd_loose_v1p3p2.xsd " +
      "http://www.imsglobal.org/xsd/qti/qtiv3p0/imscp_v1p1 https://purl.imsglobal.org/spec/qti/v3p0/schema/xsd/imsqtiv3p0_imscpv1p2_v1p0.xsd " +
      "http://www.imsglobal.org/xsd/imsqti_metadata_v3p0 https://purl.imsglobal.org/spec/qti/v3p0/schema/xsd/imsqti_metadatav3p0_v1p0.xsd",
    metadataNamespace: "http://www.imsglobal.org/xsd/imsqti_metadata_v3p0",
    schemaVersion: "3.0.0",
    manifestSchema: "QTI Package",
    manifestSchemaVersion: "3.0.0",
  },
  [QtiVersion.v2p1]: {
    namespace: "http://www.imsglobal.org/xsd/imsqti_v2p1",
    schemaLocation:
      "http://www.imsglobal.org/xsd/imsqti_v2p1 http://www.imsglobal.org/xsd/qti/qtiv2p1/imsqti_v2p1.xsd",
    responseProcessingTemplates: {
      matchCorrect:
        "http://www.imsglobal.org/question/qti_v2p1/rptemplates/match_correct",
      mapResponse:
        "http://www.imsglobal.org/question/qti_v2p1/rptemplates/map_response",
      mapResponsePoint:
        "http://www.imsglobal.org/question/qti_v2p1/rptemplates/map_response_point",
    },
    manifestNamespace: "http://www.imsglobal.org/xsd/imscp_v1p1",
    manifestSchemaLocation:
      "http://www.imsglobal.org/xsd/imscp_v1p1 http://www.imsglobal.org/xsd/qti/qtiv2p1/qtiv2p1_imscpv1p2_v1p0.xsd",
    metadataNamespace: "http://www.imsglobal.org/xsd/imsqti_v2p1",
    schemaVersion: "2.1.0",
    // The v2.1 IMS Content Package schema restricts these to a fixed set.
    manifestSchema: "QTIv2.1 Package",
    manifestSchemaVersion: "1.0.0",
  },
};

export type QtiCardinality = "single" | "multiple" | "ordered" | "record";

export type QtiBaseType =
  | "boolean"
  | "directedPair"
  | "duration"
  | "file"
  | "float"
  | "identifier"
  | "integer"
  | "pair"
  | "point"
  | "string"
  | "uri";

export type QtiAudience =
  "author" | "candidate" | "proctor" | "scorer" | "testConstructor" | "tutor";
