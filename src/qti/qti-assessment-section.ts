export type QtiAssessmentSectionOptions = {
  identifier: string;
  title: string;
  visible: boolean;
  class?: string;
  fixed?: boolean;
  required?: boolean;
  keepTogether?: boolean;
};

export type QtiItemReference = {
  itemIdentifier: string;
  href: string;
};

export class QtiAssessmentSection {
  public identifier: string;
  public title: string;
  public visible: boolean;
  public class?: string;
  public fixed?: boolean;
  public required?: boolean;
  public keepTogether?: boolean;

  /** Item references and nested sections, in the order they appear. */
  protected children: (QtiItemReference | QtiAssessmentSection)[] = [];

  constructor(options: QtiAssessmentSectionOptions) {
    this.identifier = options.identifier;
    this.title = options.title;
    this.visible = options.visible;
    this.class = options.class;
    this.fixed = options.fixed ?? false;
    this.required = options.required ?? false;
    this.keepTogether = options.keepTogether ?? true;
  }

  public addItemReference(itemIdentifier: string, href: string) {
    this.children.push({ itemIdentifier, href });
  }

  public addSection(section: QtiAssessmentSection) {
    this.children.push(section);
  }

  /** The item references directly in this section. */
  public getItemReferences(): QtiItemReference[] {
    return this.children.filter(
      (child): child is QtiItemReference =>
        !(child instanceof QtiAssessmentSection),
    );
  }

  /** The sections nested directly in this section. */
  public getSections(): QtiAssessmentSection[] {
    return this.children.filter(
      (child): child is QtiAssessmentSection =>
        child instanceof QtiAssessmentSection,
    );
  }

  public getChildren(): (QtiItemReference | QtiAssessmentSection)[] {
    return this.children;
  }
}
