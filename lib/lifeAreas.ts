import type { BucketIconKey } from "./categories";

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

export interface LifeArea {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: BucketIconKey;
  coreValue: CoreValue | null;
  sortOrder: number;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
  deleted?: boolean;
  syncedAt?: number | null;
}

export const MAX_LIFE_AREAS = 5;
export const LIFE_AREA_NAME_MAX = 30;
export const LIFE_AREA_DESCRIPTION_MAX = 140;

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

export const LIFE_AREA_ICON_KEYS: BucketIconKey[] = [
  "briefcase",
  "heart",
  "home",
  "book",
  "sparkle",
  "dumbbell",
  "moon-star",
  "users",
  "palette",
  "hand-helping",
  "shield",
  "coins",
  "target",
  "church",
  "graduation-cap",
  "baby",
  "smile",
  "wrench",
  "plane",
  "calendar",
];

export const SUGGESTED_LIFE_AREAS = [
  "Career",
  "Health",
  "Family",
  "Faith",
  "Friendships",
  "Growth",
  "Money",
  "Side Projects",
  "Creative",
  "Service",
];

export const LIFE_AREA_STARTERS: Record<string, string> = {
  Career: "Building something that lasts and gives me autonomy.",
  Health: "Protecting the body and energy that carry everything else.",
  Family: "Showing up with steadiness for the people closest to me.",
  Faith: "Staying rooted in what is bigger than the day.",
  Friendships: "Keeping connection alive beyond good intentions.",
  Growth: "Becoming more capable, honest, and free.",
  Money: "Creating security and choices for future me.",
  "Side Projects": "Giving promising ideas a real place to grow.",
  Creative: "Making room for expression, play, and craft.",
  Service: "Turning care into useful action.",
  General: "A home for anything that does not fit yet.",
};

export function getLifeAreaById(
  id: string | null | undefined,
  lifeAreas: LifeArea[]
): LifeArea | null {
  if (!id) return null;
  return lifeAreas.find((area) => area.id === id && !area.deleted) ?? null;
}

export function activeLifeAreas(lifeAreas: LifeArea[]): LifeArea[] {
  return lifeAreas
    .filter((area) => !area.archived && !area.deleted)
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.createdAt - b.createdAt;
    });
}

