import Zip from "jszip";

import {
  ImsManifest,
  ImsManifestOptions,
  ImsManifestResource,
} from "./ims-manifest";
import { QtiVersion } from "../qti/types";

export type ImsPackageFileData =
  Uint8Array | ArrayBuffer | string | Blob | NodeJS.ReadableStream;

export type ImsPackageFileFromData = {
  filename: string;
  data: ImsPackageFileData;
};

export type ImsPackageFileFromUrl = {
  filename: string;
  url: string;
};

export type ImsPackageFile = ImsPackageFileFromData | ImsPackageFileFromUrl;

export type ImsManifestResourceWithoutFiles = Omit<
  ImsManifestResource,
  "files"
>;

export class ImsPackage {
  public manifest: ImsManifest;
  public zip: Zip;

  /**
   * Get the QTI version of this package.
   */
  get version(): QtiVersion {
    return this.manifest.version;
  }

  /**
   * Create a new IMS Package.
   */
  constructor(manifestOptions?: ImsManifestOptions) {
    this.manifest = new ImsManifest(manifestOptions);
    this.zip = new Zip();
  }

  static async fromZip(zipContents: ArrayBuffer | Buffer): Promise<ImsPackage> {
    const zip = await Zip.loadAsync(zipContents);
    const manifestFile = zip.file("imsmanifest.xml");
    if (!manifestFile) {
      throw new Error("Invalid IMS Package: Missing imsmanifest.xml");
    }

    const manifestXml = await manifestFile.async("string");
    const manifest = ImsManifest.fromXmlString(manifestXml);

    const imsPackage = new ImsPackage(manifest);
    imsPackage.manifest = manifest;
    imsPackage.zip = zip;

    return imsPackage;
  }

  /**
   * Add a resource to the IMS Package, along with its associated files.
   */
  async addResource(
    resource: ImsManifestResourceWithoutFiles,
    files: ImsPackageFile[],
  ) {
    for (const file of files) {
      await this.addFileDirectly(file);
    }

    this.manifest.addResource({
      ...resource,
      files: files.map((file) => ({ href: file.filename })),
    });
  }

  async getResourceContentsString(
    resourceIdentifier: string,
  ): Promise<string | undefined> {
    const resource = this.manifest.getResourceByIdentifier(resourceIdentifier);

    if (!resource || !resource.href) {
      throw new Error(
        `Resource with identifier ${resourceIdentifier} not found or has no href`,
      );
    }

    const href = resource.href || resource.files[0]?.href;
    const file = this.zip.file(href);
    if (!file) {
      throw new Error(
        `File for resource with identifier ${resourceIdentifier} not found in ZIP in path ${href}`,
      );
    }

    return file.async("string");
  }

  /**
   * Add a file directly to the final ZIP, without adding it to the manifest.
   * Can fetch from URL or add from data.
   */
  async addFileDirectly(file: ImsPackageFile) {
    if ("url" in file) {
      const response = await fetch(file.url);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch resource from ${file.url}: ${response.statusText}`,
        );
      }
      const data = await response.arrayBuffer();

      this.zip.file(file.filename, data);
    }

    if ("data" in file) {
      this.zip.file(file.filename, file.data);
    }
  }

  /**
   * Output the IMS Package as a ZIP file.
   */
  generateZip(): Promise<ArrayBuffer> {
    this.zip.file("imsmanifest.xml", this.manifest.buildXml());

    return this.zip.generateAsync({ type: "arraybuffer" });
  }
}
