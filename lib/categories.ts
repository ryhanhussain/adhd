export interface Category {
  name: string;
  color: string;
}

/**
 * Intention category ("bucket"). User-defined, up to 3, each with a short
 * description that's passed verbatim to the brain-dump Gemini prompt so the
 * model can sort tasks by the user's own mental model rather than a canned
 * taxonomy.
 */
export interface IntentionCategory {
  id: string;          // stable uuid
  name: string;        // short label, 1-20 chars
  description: string; // 1-sentence prompt hint, <=140 chars
  color: string;       // hex from COLOR_OPTIONS
}

export const MAX_INTENTION_CATEGORIES = 3;
export const INTENTION_CATEGORY_NAME_MAX = 20;
export const INTENTION_CATEGORY_DESCRIPTION_MAX = 140;

export const COLOR_OPTIONS: { color: string; label: string }[] = [
  { color: "#7c5cfc", label: "Purple" },
  { color: "#3b82f6", label: "Blue" },
  { color: "#22c55e", label: "Green" },
  { color: "#f59e0b", label: "Amber" },
  { color: "#f97316", label: "Orange" },
  { color: "#ec4899", label: "Pink" },
  { color: "#14b8a6", label: "Teal" },
  { color: "#a1a1aa", label: "Gray" },
];

export const DEFAULT_CATEGORIES: Category[] = [
  { name: "Deep Work", color: "#7c5cfc" },
  { name: "Admin", color: "#3b82f6" },
  { name: "Leisure", color: "#f59e0b" },
  { name: "Health", color: "#22c55e" },
  { name: "Errands", color: "#f97316" },
  { name: "Social", color: "#ec4899" },
  { name: "Food", color: "#14b8a6" },
  { name: "Self-Care", color: "#a1a1aa" },
];

const OTHER_CATEGORY: Category = { name: "Other", color: "#a1a1aa" };

export function getCategoryStyle(tag: string, categories: Category[]): Category {
  return categories.find((c) => c.name === tag) || OTHER_CATEGORY;
}

export function getCategoryNames(categories: Category[]): string[] {
  return categories.map((c) => c.name);
}

export function getIntentionCategoryById(
  id: string | null | undefined,
  categories: IntentionCategory[]
): IntentionCategory | null {
  if (!id) return null;
  return categories.find((c) => c.id === id) ?? null;
}
