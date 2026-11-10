import type { CheerioAPI } from "cheerio";
import type { Element } from "domhandler";
import { XMLBuilder } from "xmlbuilder2/lib/interfaces";

import { QtiBaseType, QtiVersion } from "./types";
import {
  toAttributeName,
  toElementName,
  toVersionedAttributes,
} from "../utils/version";

/** An expression in response processing, e.g. to test a response or compute a score. */
export type QtiExpression =
  | { variable: string }
  | { correct: string }
  | { baseValue: string | number; baseType: QtiBaseType }
  | { mapResponse: string }
  | { mapResponsePoint: string }
  | { isNull: QtiExpression }
  | { not: QtiExpression }
  | { and: QtiExpression[] }
  | { or: QtiExpression[] }
  | { sum: QtiExpression[] }
  | { multiple: QtiExpression[] }
  | { match: [QtiExpression, QtiExpression] }
  | { member: [QtiExpression, QtiExpression] }
  | { gt: [QtiExpression, QtiExpression] }
  | { gte: [QtiExpression, QtiExpression] }
  | { stringMatch: [QtiExpression, QtiExpression]; caseSensitive?: boolean };

/** A response processing rule: set an outcome, or an if / else-if / else. */
export type QtiResponseRule =
  | { setOutcomeValue: string; value: QtiExpression }
  | {
      conditions: { if: QtiExpression; then: QtiResponseRule[] }[];
      else?: QtiResponseRule[];
    };

const NESTED_EXPRESSIONS = {
  isNull: "qti-is-null",
  not: "qti-not",
  and: "qti-and",
  or: "qti-or",
  sum: "qti-sum",
  multiple: "qti-multiple",
  match: "qti-match",
  member: "qti-member",
  gt: "qti-gt",
  gte: "qti-gte",
} as const;

export const appendExpression = (
  parent: XMLBuilder,
  expression: QtiExpression,
  version: QtiVersion,
) => {
  const ele = (name: string, attributes: Record<string, string> = {}) =>
    parent.ele(
      toElementName(name, version),
      toVersionedAttributes(attributes, version),
    );

  if ("variable" in expression) {
    ele("qti-variable", { identifier: expression.variable });
  } else if ("correct" in expression) {
    ele("qti-correct", { identifier: expression.correct });
  } else if ("baseValue" in expression) {
    ele("qti-base-value", { "base-type": expression.baseType }).txt(
      expression.baseValue.toString(),
    );
  } else if ("mapResponse" in expression) {
    ele("qti-map-response", { identifier: expression.mapResponse });
  } else if ("mapResponsePoint" in expression) {
    ele("qti-map-response-point", {
      identifier: expression.mapResponsePoint,
    });
  } else if ("stringMatch" in expression) {
    const node = ele("qti-string-match", {
      "case-sensitive": (expression.caseSensitive ?? true).toString(),
    });
    for (const operand of expression.stringMatch) {
      appendExpression(node, operand, version);
    }
  } else {
    const [key, value] = Object.entries(expression)[0] as [
      keyof typeof NESTED_EXPRESSIONS,
      QtiExpression | QtiExpression[],
    ];
    const node = ele(NESTED_EXPRESSIONS[key]);
    for (const operand of [value].flat()) {
      appendExpression(node, operand, version);
    }
  }
};

export const appendResponseRules = (
  parent: XMLBuilder,
  rules: QtiResponseRule[],
  version: QtiVersion,
) => {
  const el = (name: string) => toElementName(name, version);

  for (const rule of rules) {
    if ("setOutcomeValue" in rule) {
      const node = parent.ele(el("qti-set-outcome-value"), {
        identifier: rule.setOutcomeValue,
      });
      appendExpression(node, rule.value, version);
      continue;
    }

    const condition = parent.ele(el("qti-response-condition"));
    rule.conditions.forEach((branch, index) => {
      const node = condition.ele(
        el(index === 0 ? "qti-response-if" : "qti-response-else-if"),
      );
      appendExpression(node, branch.if, version);
      appendResponseRules(node, branch.then, version);
    });
    if (rule.else) {
      appendResponseRules(
        condition.ele(el("qti-response-else")),
        rule.else,
        version,
      );
    }
  }
};

const NESTED_EXPRESSION_KEYS = Object.fromEntries(
  Object.entries(NESTED_EXPRESSIONS).map(([key, tagName]) => [tagName, key]),
) as Record<string, keyof typeof NESTED_EXPRESSIONS>;

const OPERAND_COUNTS: Partial<Record<keyof typeof NESTED_EXPRESSIONS, number>> =
  { isNull: 1, not: 1, match: 2, member: 2, gt: 2, gte: 2 };

/** QTI 2.1 element names (e.g. `isNull`) as their QTI 3.0 name (`qti-is-null`). */
const qti3ElementName = (element: Element) =>
  element.tagName.startsWith("qti-")
    ? element.tagName
    : `qti-${element.tagName.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;

/** Reads an expression, or returns undefined if it uses anything we don't support. */
export const parseExpression = (
  $: CheerioAPI,
  element: Element,
  version: QtiVersion,
): QtiExpression | undefined => {
  const attr = (name: string) =>
    $(element).attr(toAttributeName(name, version));
  const identifier = attr("identifier");
  const operands = $(element)
    .children()
    .toArray()
    .map((child) => parseExpression($, child, version));
  if (operands.some((operand) => !operand)) return undefined;
  const expressions = operands as QtiExpression[];
  const name = qti3ElementName(element);

  switch (name) {
    case "qti-variable":
      return identifier ? { variable: identifier } : undefined;
    case "qti-correct":
      return identifier ? { correct: identifier } : undefined;
    case "qti-map-response":
      return identifier ? { mapResponse: identifier } : undefined;
    case "qti-map-response-point":
      return identifier ? { mapResponsePoint: identifier } : undefined;
    case "qti-base-value": {
      const baseType = attr("base-type") as QtiBaseType | undefined;
      if (!baseType) return undefined;
      const text = $(element).text().trim();
      const numeric = baseType === "float" || baseType === "integer";
      return { baseValue: numeric ? Number(text) : text, baseType };
    }
    case "qti-string-match":
      if (expressions.length !== 2) return undefined;
      return {
        stringMatch: [expressions[0], expressions[1]],
        caseSensitive: attr("case-sensitive") !== "false",
      };
  }

  const key = NESTED_EXPRESSION_KEYS[name];
  if (!key) return undefined;
  const count = OPERAND_COUNTS[key];
  if (count && expressions.length !== count) return undefined;
  return { [key]: count === 1 ? expressions[0] : expressions } as QtiExpression;
};

/** Reads response processing rules, or returns undefined if any isn't supported. */
export const parseResponseRules = (
  $: CheerioAPI,
  elements: Element[],
  version: QtiVersion,
): QtiResponseRule[] | undefined => {
  const rules = elements.map((element) =>
    parseResponseRule($, element, version),
  );
  return rules.every((rule) => rule != null) ? rules : undefined;
};

const parseResponseRule = (
  $: CheerioAPI,
  element: Element,
  version: QtiVersion,
): QtiResponseRule | undefined => {
  const children = $(element).children().toArray();
  const name = qti3ElementName(element);

  if (name === "qti-set-outcome-value") {
    const identifier = $(element).attr("identifier");
    const value = children[0] && parseExpression($, children[0], version);
    return identifier && value
      ? { setOutcomeValue: identifier, value }
      : undefined;
  }
  if (name !== "qti-response-condition") return undefined;

  const conditions: { if: QtiExpression; then: QtiResponseRule[] }[] = [];
  let otherwise: QtiResponseRule[] | undefined;
  for (const branch of children) {
    const [condition, ...rules] = $(branch).children().toArray();
    const branchName = qti3ElementName(branch);

    if (branchName === "qti-response-else") {
      otherwise = parseResponseRules(
        $,
        $(branch).children().toArray(),
        version,
      );
      if (!otherwise) return undefined;
    } else if (
      (branchName === "qti-response-if" ||
        branchName === "qti-response-else-if") &&
      condition
    ) {
      const expression = parseExpression($, condition, version);
      const then = parseResponseRules($, rules, version);
      if (!expression || !then) return undefined;
      conditions.push({ if: expression, then });
    } else {
      return undefined;
    }
  }

  if (!conditions.length) return undefined;
  return otherwise ? { conditions, else: otherwise } : { conditions };
};
