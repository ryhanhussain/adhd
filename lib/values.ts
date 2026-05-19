export type CoreValue =
  | "self_direction"
  | "achievement"
  | "benevolence"
  | "security"
  | "stimulation"
  | "hedonism"
  | "power"
  | "tradition"
  | "conformity"
  | "universalism";

export type PersonalValueId =
  | "freedom"
  | "growth"
  | "connection"
  | "security"
  | "mastery"
  | "service"
  | "creativity"
  | "adventure"
  | "faith"
  | "peace";

export interface PersonalValue {
  id: PersonalValueId;
  label: string;
  coreValue: CoreValue;
  line: string;
  color: string;
}

export const MIN_PERSONAL_VALUES = 2;
export const MAX_PERSONAL_VALUES = 3;

export const CORE_VALUE_OPTIONS: { value: CoreValue; label: string }[] = [
  { value: "self_direction", label: "Self-direction" },
  { value: "achievement", label: "Achievement" },
  { value: "benevolence", label: "Benevolence" },
  { value: "security", label: "Security" },
  { value: "stimulation", label: "Stimulation" },
  { value: "hedonism", label: "Hedonism" },
  { value: "power", label: "Power" },
  { value: "tradition", label: "Tradition" },
  { value: "conformity", label: "Conformity" },
  { value: "universalism", label: "Universalism" },
];

export const VALUE_OPTIONS: PersonalValue[] = [
  {
    id: "freedom",
    label: "Freedom",
    coreValue: "self_direction",
    line: "I want to live life on my own terms.",
    color: "#7c5cfc",
  },
  {
    id: "growth",
    label: "Growth",
    coreValue: "self_direction",
    line: "I want to keep becoming more capable and honest.",
    color: "#22c55e",
  },
  {
    id: "connection",
    label: "Connection",
    coreValue: "benevolence",
    line: "I want to show up for the people who matter.",
    color: "#ec4899",
  },
  {
    id: "security",
    label: "Security",
    coreValue: "security",
    line: "I want steadiness, safety, and room to breathe.",
    color: "#3b82f6",
  },
  {
    id: "mastery",
    label: "Mastery",
    coreValue: "achievement",
    line: "I want to build skill I can trust.",
    color: "#f59e0b",
  },
  {
    id: "service",
    label: "Service",
    coreValue: "benevolence",
    line: "I want care to turn into useful action.",
    color: "#14b8a6",
  },
  {
    id: "creativity",
    label: "Creativity",
    coreValue: "self_direction",
    line: "I want to make things that feel alive.",
    color: "#8b5cf6",
  },
  {
    id: "adventure",
    label: "Adventure",
    coreValue: "stimulation",
    line: "I want novelty, courage, and a bigger life.",
    color: "#f97316",
  },
  {
    id: "faith",
    label: "Faith",
    coreValue: "tradition",
    line: "I want to stay rooted in what is bigger than me.",
    color: "#6366f1",
  },
  {
    id: "peace",
    label: "Peace",
    coreValue: "security",
    line: "I want calm, clarity, and fewer self-made fires.",
    color: "#a1a1aa",
  },
];

const VALUE_BY_ID = new Map(VALUE_OPTIONS.map((value) => [value.id, value]));
const VALUE_ID_SET = new Set(VALUE_OPTIONS.map((value) => value.id));

export function isPersonalValueId(value: unknown): value is PersonalValueId {
  return typeof value === "string" && VALUE_ID_SET.has(value as PersonalValueId);
}

export function getPersonalValueById(id: string | null | undefined): PersonalValue | null {
  if (!id || !isPersonalValueId(id)) return null;
  return VALUE_BY_ID.get(id) ?? null;
}

export function getCoreValueLabel(coreValue: CoreValue | null | undefined): string | null {
  if (!coreValue) return null;
  return CORE_VALUE_OPTIONS.find((option) => option.value === coreValue)?.label ?? null;
}

export function normalizePersonalValueIds(input: unknown): PersonalValueId[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<PersonalValueId>();
  for (const item of input) {
    const id =
      typeof item === "string"
        ? item
        : item && typeof item === "object" && "id" in item
          ? (item as { id?: unknown }).id
          : null;
    if (!isPersonalValueId(id) || seen.has(id)) continue;
    seen.add(id);
    if (seen.size >= MAX_PERSONAL_VALUES) break;
  }
  return Array.from(seen);
}

export function personalValuesFromIds(ids: unknown): PersonalValue[] {
  return normalizePersonalValueIds(ids)
    .map((id) => getPersonalValueById(id))
    .filter((value): value is PersonalValue => value !== null);
}

export function parsePersonalValues(raw: string | null): PersonalValue[] {
  if (!raw) return [];
  try {
    return personalValuesFromIds(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function serializePersonalValues(ids: PersonalValueId[]): string {
  return JSON.stringify(normalizePersonalValueIds(ids));
}

export function firstValueForCoreValue(coreValue: CoreValue | null | undefined): PersonalValue | null {
  if (!coreValue) return null;
  return VALUE_OPTIONS.find((value) => value.coreValue === coreValue) ?? null;
}

export const LIFE_AREA_VALUE_MATCHES: Record<string, PersonalValueId[]> = {
  Career: ["freedom", "mastery", "growth"],
  Health: ["peace", "growth", "security"],
  Family: ["connection", "security", "service"],
  Faith: ["faith", "service", "peace"],
  Friendships: ["connection", "adventure"],
  Growth: ["growth", "mastery", "freedom"],
  Money: ["security", "freedom"],
  "Side Projects": ["freedom", "creativity", "mastery"],
  Creative: ["creativity", "freedom"],
  Service: ["service", "connection"],
  General: [],
};

export function suggestedValueIdsForLifeArea(
  lifeAreaName: string,
  selectedValueIds: PersonalValueId[]
): PersonalValueId[] {
  const suggested = LIFE_AREA_VALUE_MATCHES[lifeAreaName] ?? [];
  const selected = new Set(selectedValueIds);
  const matches = suggested.filter((id) => selected.has(id));
  if (matches.length > 0) return matches.slice(0, 2);
  return selectedValueIds.slice(0, 1);
}
