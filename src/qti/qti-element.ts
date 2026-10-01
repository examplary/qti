import { XMLBuilder } from "xmlbuilder2/lib/interfaces";

export type NamespacedElementContent =
  | string
  | { [key: string]: NamespacedElementContent }
  | NamespacedElementContent[];

export type NamespacedElement = {
  namespace: string;
  elementName: string;
  content: NamespacedElementContent;
  attributes?: Record<string, string | undefined>;
};

/** Attribute prefixes that belong to XML itself rather than to an extension. */
const RESERVED_PREFIXES = ["xml", "xmlns", "xsi"];

export abstract class QtiElement {
  protected namespaces: Record<string, string> = {};
  protected namespaceElements: NamespacedElement[] = [];
  protected namespaceAttributes: Record<string, Record<string, string>> = {};

  public abstract buildXml(): string;

  public registerNamespace(prefix: string, uri: string): void {
    this.namespaces[prefix] = uri;
  }

  public addNamespacedElement(
    namespace: string,
    elementName: string,
    content: NamespacedElementContent,
    attributes?: Record<string, string | undefined>,
  ): void {
    this.namespaceElements.push({
      namespace,
      elementName,
      content,
      attributes,
    });
  }

  /**
   * Adds an extension attribute (`prefix:name="value"`) to the root element.
   * Unlike namespaced elements, these keep the document schema-valid: QTI
   * allows attributes from any namespace on assessment items and tests.
   */
  public addNamespacedAttribute(
    namespace: string,
    name: string,
    value: string | undefined,
  ): void {
    if (value === undefined) return;
    this.namespaceAttributes[namespace] ??= {};
    this.namespaceAttributes[namespace][name] = value;
  }

  /** The extension attributes of one namespace, keyed by their local name. */
  public getNamespacedAttributes(namespace: string): Record<string, string> {
    return this.namespaceAttributes[namespace] ?? {};
  }

  /** Picks up the extension attributes of a parsed root element. */
  protected readNamespacedAttributes(attributes: Record<string, string>) {
    for (const [qualifiedName, value] of Object.entries(attributes)) {
      const [prefix, name] = qualifiedName.split(":");
      if (!name || RESERVED_PREFIXES.includes(prefix)) continue;
      this.addNamespacedAttribute(prefix, name, value);
    }
  }

  public getNamespacedElements(): NamespacedElement[] {
    return this.namespaceElements;
  }

  public getNamespacedElement(
    namespace: string,
    elementName: string,
  ): NamespacedElement | undefined {
    return this.namespaceElements.find(
      (e) => e.namespace === namespace && e.elementName === elementName,
    );
  }

  protected appendNamespacesAndElements(element: XMLBuilder): void {
    for (const [prefix, uri] of Object.entries(this.namespaces)) {
      element.att(`xmlns:${prefix}`, uri);
    }

    for (const [namespace, attributes] of Object.entries(
      this.namespaceAttributes,
    )) {
      for (const [name, value] of Object.entries(attributes)) {
        element.att(`${namespace}:${name}`, value);
      }
    }

    for (const nsElement of this.namespaceElements) {
      const child = element.ele(
        `${nsElement.namespace}:${nsElement.elementName}`,
        nsElement.attributes,
      );
      this.appendContent(child, nsElement.namespace, nsElement.content);
    }
  }

  private appendContent(
    element: XMLBuilder,
    namespace: string,
    content: NamespacedElementContent,
  ): void {
    if (typeof content === "string") {
      element.txt(content);
    } else if (Array.isArray(content)) {
      for (const item of content) {
        this.appendContent(element, namespace, item);
      }
    } else {
      for (const [key, value] of Object.entries(content)) {
        const child = element.ele(`${namespace}:${key}`);
        this.appendContent(child, namespace, value);
      }
    }
  }
}
