import type { FieldDefinition, VisibilityCondition } from "@/lib/types/schema";

/**
 * Conditional-visibility rules (`visibleIf`) — shared by the form renderer and
 * the PDF worker so a field hidden on screen is also left out of the PDF.
 */
export function evaluateCondition(condition: VisibilityCondition, data: Record<string, unknown>): boolean {
  const results = condition.rules.map((rule) => {
    const val = data[rule.fieldKey];
    switch (rule.operator) {
      case "==":
        return String(val) === String(rule.value);
      case "!=":
        return String(val) !== String(rule.value);
      case ">":
        return Number(val) > Number(rule.value);
      case "<":
        return Number(val) < Number(rule.value);
      case ">=":
        return Number(val) >= Number(rule.value);
      case "<=":
        return Number(val) <= Number(rule.value);
      case "contains":
        if (Array.isArray(val)) return val.includes(rule.value);
        return String(val).includes(String(rule.value ?? ""));
      case "is_empty":
        return !val || (Array.isArray(val) ? val.length === 0 : String(val).trim() === "");
      case "is_not_empty":
        return !!val && (Array.isArray(val) ? val.length > 0 : String(val).trim() !== "");
      default:
        return true;
    }
  });

  return condition.logic === "AND" ? results.every(Boolean) : results.some(Boolean);
}

export function isFieldVisible(
  field: Pick<FieldDefinition, "visibleIf">,
  data: Record<string, unknown>
): boolean {
  if (!field.visibleIf) return true;
  return evaluateCondition(field.visibleIf, data);
}
