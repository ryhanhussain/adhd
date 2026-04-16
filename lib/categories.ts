export interface Category {
  name: string;
  color: string;
}

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
