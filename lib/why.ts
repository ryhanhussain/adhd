import { getLifeAreaValues, type LifeArea } from "./lifeAreas";
import { getCoreValueLabel, type CoreValue, type PersonalValue } from "./values";

export const WHY_CHAIN_MAX = 180;

const CORE_VALUE_FRAMES: Record<CoreValue, string> = {
  self_direction: "Self-direction (the life you choose)",
  achievement: "Achievement (the standards you build)",
  benevolence: "Benevolence (the people you serve)",
  security: "Security (the steadiness you protect)",
  stimulation: "Stimulation (the energy you keep alive)",
  hedonism: "Hedonism (the joy you let in)",
  power: "Power (the agency you build)",
  tradition: "Tradition (the roots that hold you)",
  conformity: "Conformity (the trust you keep)",
  universalism: "Universalism (the wider good)",
};

function cleanSegment(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\s*(?:->|→)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeWhyChain(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length === 0) return null;
  return normalized.slice(0, WHY_CHAIN_MAX);
}

export function coreValueWhyLabel(coreValue: CoreValue | null | undefined): string | null {
  if (!coreValue) return null;
  return CORE_VALUE_FRAMES[coreValue] ?? getCoreValueLabel(coreValue);
}

export function buildTaskWhyChain({
  taskText,
  lifeArea,
  selectedValues,
}: {
  taskText: string;
  lifeArea?: LifeArea | null;
  selectedValues?: PersonalValue[];
}): string | null {
  const task = cleanSegment(taskText);
  if (!task || !lifeArea) return null;

  const values = getLifeAreaValues(lifeArea, selectedValues);
  const valueLabel = cleanSegment(values[0]?.label);
  const lifeAreaReason = cleanSegment(lifeArea.description) || cleanSegment(lifeArea.name);
  const coreValue =
    coreValueWhyLabel(lifeArea.coreValue ?? values[0]?.coreValue ?? null) ?? null;

  const parts = [task, valueLabel, lifeAreaReason, coreValue].filter(
    (part): part is string => !!part
  );
  if (parts.length < 2) return null;
  return normalizeWhyChain(parts.join(" → "));
}
