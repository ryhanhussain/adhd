"use client";

import { useState, useEffect, useRef } from "react";
import { type Entry, type EnergyLevel, updateEntry } from "@/lib/db";
import { getCategoryStyle, type Category } from "@/lib/categories";

const ENERGY_OPTIONS: { value: EnergyLevel; emoji: string; label: string }[] = [
  { value: "high", emoji: "🔋", label: "High" },
  { value: "medium", emoji: "⚡", label: "Medium" },
  { value: "low", emoji: "🪫", label: "Low" },
  { value: "scattered", emoji: "🌪️", label: "Scattered" },
];
import BottomSheet from "./BottomSheet";

interface EntryEditSheetProps {
  entry: Entry | null;
  categories: Category[];
  onClose: () => void;
  onSave: (updated: Entry) => void;
  onDelete: (id: string) => void;
}

function tsToTimeStr(ts: number): string {
  const d = new Date(ts);
  return d.toTimeString().slice(0, 5);
}

function timeStrToTs(timeStr: string, referenceDate: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  const d = new Date(referenceDate + "T00:00:00");
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

export default function EntryEditSheet({ entry, categories, onClose, onSave, onDelete }: EntryEditSheetProps) {
  const [text, setText] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [energy, setEnergy] = useState<EnergyLevel | null>(null);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  const isTimer = entry?.endTime === 0;

  useEffect(() => {
    if (entry) {
      setText(entry.text);
      setStartTime(tsToTimeStr(entry.startTime || entry.timestamp));
      setEndTime(entry.endTime === 0 ? "" : tsToTimeStr(entry.endTime || entry.timestamp));
      setTags([...entry.tags]);
      setEnergy(entry.energy ?? null);
      setShowTagPicker(false);
    }
  }, [entry]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
    }
  }, [text]);

  useEffect(() => {
    if (showTagPicker) {
      requestAnimationFrame(() => {
        pickerRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      });
    }
  }, [showTagPicker]);

  if (!entry) return null;

  const originalStartTime = tsToTimeStr(entry.startTime || entry.timestamp);
  const originalEndTime = entry.endTime === 0 ? "" : tsToTimeStr(entry.endTime || entry.timestamp);
  const isDirty =
    text !== entry.text ||
    startTime !== originalStartTime ||
    endTime !== originalEndTime ||
    JSON.stringify(tags) !== JSON.stringify(entry.tags) ||
    energy !== (entry.energy ?? null);

  const handleSave = async () => {
    if (!isDirty || isSaving) return;
    setIsSaving(true);
    const newEndTime = endTime ? timeStrToTs(endTime, entry.date) : 0;
    const updated = await updateEntry(entry.id, {
      text,
      startTime: timeStrToTs(startTime, entry.date),
      endTime: newEndTime,
      tags,
      energy,
    });
    setIsSaving(false);
    if (updated) onSave(updated);
  };

  const handleFinishTimer = async () => {
    setIsSaving(true);
    const updated = await updateEntry(entry.id, { endTime: Date.now() });
    setIsSaving(false);
    if (updated) {
      window.dispatchEvent(new Event("entry-updated"));
      onSave(updated);
    }
  };

  const handleDelete = () => {
    onDelete(entry.id);
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const addTag = (tagName: string) => {
    if (!tags.includes(tagName)) {
      setTags([...tags, tagName]);
    }
    setShowTagPicker(false);
  };

  const availableTags = categories.filter((c) => !tags.includes(c.name));

  return (
    <BottomSheet open={!!entry} onClose={onClose} ariaLabel="Edit entry">
      <div className="px-5 pb-6">
        <label className="text-xs font-medium mb-1.5 block text-[var(--color-text-muted)]">
          Entry
        </label>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-opacity-40"
          rows={2}
        />

        <div className="flex gap-3 mt-4">
          <div className="flex-1">
            <label className="text-xs font-medium mb-1.5 block text-[var(--color-text-muted)]">
              Started
            </label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-opacity-40"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs font-medium mb-1.5 block text-[var(--color-text-muted)]">
              Ended
            </label>
            {isTimer ? (
              <button
                onClick={handleFinishTimer}
                className="w-full rounded-xl bg-[var(--color-accent)] text-[var(--color-on-accent)] px-3 py-2.5 text-sm font-medium transition-transform active:scale-[0.98]"
              >
                Just Finished
              </button>
            ) : (
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-opacity-40"
              />
            )}
          </div>
        </div>

        <label className="text-xs font-medium mt-4 mb-1.5 block text-[var(--color-text-muted)]">
          Tags
        </label>
        <div className="flex flex-wrap gap-2 items-center">
          {tags.map((tag) => {
            const style = getCategoryStyle(tag, categories);
            return (
              <button
                key={tag}
                onClick={() => removeTag(tag)}
                aria-label={`Remove tag ${tag}`}
                className="inline-flex items-center gap-1.5 px-3 py-2 min-h-11 rounded-full text-xs font-medium transition-transform active:scale-95"
                style={{ backgroundColor: style.color + "30", color: "var(--color-text)" }}
              >
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: style.color }} aria-hidden="true" />
                {tag}
                <span className="ml-0.5 opacity-60" aria-hidden="true">×</span>
              </button>
            );
          })}

          {availableTags.length > 0 && (
            <button
              onClick={() => setShowTagPicker(!showTagPicker)}
              aria-label="Add tag"
              aria-expanded={showTagPicker}
              className="inline-flex items-center px-3 py-2 min-h-11 rounded-full text-xs font-medium border border-dashed border-[var(--color-border)] text-[var(--color-text-muted)] transition-transform active:scale-95"
            >
              + Add
            </button>
          )}
        </div>

        {showTagPicker && availableTags.length > 0 && (
          <div ref={pickerRef} className="mt-3 p-3 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] shadow-sm animate-fade-in overflow-hidden relative">
            <div className="absolute inset-0 bg-[var(--color-surface)] opacity-50" />
            <div className="relative">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-2 px-1">
                Select Category
              </div>
              <div className="grid grid-cols-2 gap-2 max-h-[40vh] overflow-y-auto">
                {availableTags.map((cat) => (
                  <button
                    key={cat.name}
                    onClick={() => addTag(cat.name)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-[var(--color-text)] bg-[var(--color-bg)] border border-[var(--glass-border)] hover:border-[var(--color-accent)] hover:shadow-sm active:scale-95 transition-all text-left"
                  >
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 shadow-sm" style={{ backgroundColor: cat.color }} />
                    <span className="truncate">{cat.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <label className="text-xs font-medium mt-4 mb-1.5 block text-[var(--color-text-muted)]">
          Energy
        </label>
        <div className="flex gap-1.5">
          {ENERGY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setEnergy(energy === opt.value ? null : opt.value)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all duration-200 active:scale-95 ${energy === opt.value
                  ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)] border border-[var(--color-accent)]/40"
                  : "border border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-accent)]/30"
                }`}
              aria-pressed={energy === opt.value}
              aria-label={`Energy: ${opt.label}`}
            >
              <span>{opt.emoji}</span>
              <span>{opt.label}</span>
            </button>
          ))}
        </div>

        <button
          onClick={handleSave}
          disabled={!isDirty || isSaving}
          className="w-full mt-5 h-12 rounded-xl text-sm font-semibold text-[var(--color-on-accent)] transition-all active:scale-[0.98] disabled:opacity-40 bg-[var(--color-accent)]"
        >
          {isSaving ? "Saving..." : "Save changes"}
        </button>

        <div className="mt-4 flex justify-center">
          <button
            onClick={handleDelete}
            className="text-sm font-medium text-[var(--color-danger)] opacity-70 transition-opacity active:opacity-100"
          >
            Delete this entry
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
