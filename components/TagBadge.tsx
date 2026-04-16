"use client";

import { getCategoryStyle, type Category } from "@/lib/categories";

interface TagBadgeProps {
  tag: string;
  categories: Category[];
}

export default function TagBadge({ tag, categories }: TagBadgeProps) {
  const style = getCategoryStyle(tag, categories);

  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold text-[var(--color-text)]"
      style={{ backgroundColor: style.color + "30" }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full mr-1.5 flex-shrink-0"
        style={{ backgroundColor: style.color }}
      />
      {tag}
    </span>
  );
}
