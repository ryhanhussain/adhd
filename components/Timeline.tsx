"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getEntriesByDate, deleteEntry, addEntry, searchEntries, type Entry } from "@/lib/db";
import { categorizeEntry } from "@/lib/gemini";
import { getCategoryNames, getCategoryStyle } from "@/lib/categories";
import { useCategories } from "@/lib/useCategories";
import TimelineEntry from "./TimelineEntry";
import EntryEditSheet from "./EntryEditSheet";
import WeekStrip from "./WeekStrip";

function formatTimeShort(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function Timeline() {
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const categories = useCategories();
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimeout = useRef<NodeJS.Timeout>(undefined);
  const [now, setNow] = useState(Date.now());
  const [quickText, setQuickText] = useState("");
  const [isQuickSubmitting, setIsQuickSubmitting] = useState(false);

  // Search state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Entry[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeout = useRef<NodeJS.Timeout>(undefined);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Swipe state
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const showToast = (message: string) => {
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    setToast(message);
    toastTimeout.current = setTimeout(() => setToast(null), 2500);
  };

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getEntriesByDate(date);
      setEntries(data);
    } catch (e) {
      console.error("Failed to load entries:", e);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const shiftDate = (days: number) => {
    const d = new Date(date + "T12:00:00");
    d.setDate(d.getDate() + days);
    const newDate = d.toISOString().split("T")[0];
    const todayStr = new Date().toISOString().split("T")[0];
    if (newDate > todayStr) return;
    setDate(newDate);
  };

  const isToday = date === new Date().toISOString().split("T")[0];

  const displayDate = new Date(date + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  // Swipe handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;

    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx > 0) shiftDate(-1);
      else shiftDate(1);
    }
  };

  // Search handler with debounce
  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!query.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    searchTimeout.current = setTimeout(async () => {
      const results = await searchEntries(query.trim());
      setSearchResults(results.slice(0, 50));
      setIsSearching(false);
    }, 300);
  };

  const toggleSearch = () => {
    if (searchOpen) {
      setSearchOpen(false);
      setSearchQuery("");
      setSearchResults([]);
    } else {
      setSearchOpen(true);
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  };

  // Group search results by date
  const groupedResults = searchResults.reduce<Record<string, Entry[]>>((acc, entry) => {
    const d = entry.date;
    if (!acc[d]) acc[d] = [];
    acc[d].push(entry);
    return acc;
  }, {});

  // Quick add from timeline
  const handleQuickAdd = async () => {
    const trimmed = quickText.trim();
    if (!trimmed || isQuickSubmitting) return;

    setIsQuickSubmitting(true);
    try {
      const nowTs = Date.now();
      const dateStr = new Date(nowTs).toISOString().split("T")[0];

      const geminiResult = await categorizeEntry(trimmed, getCategoryNames(categories));

      const startTime = nowTs + geminiResult.startOffsetMinutes * 60 * 1000;
      const endTime = geminiResult.isOngoing ? 0 : nowTs + geminiResult.endOffsetMinutes * 60 * 1000;

      await addEntry({
        id: crypto.randomUUID(),
        text: trimmed,
        timestamp: nowTs,
        startTime,
        endTime,
        date: dateStr,
        location: null,
        tags: geminiResult.tags,
        createdAt: nowTs,
      });

      setQuickText("");
      await loadEntries();
      showToast(geminiResult.isOngoing ? "Timer started" : "Logged");
      window.dispatchEvent(new Event("entry-updated"));
    } finally {
      setIsQuickSubmitting(false);
    }
  };

  const handleSave = async (updated: Entry) => {
    setSelectedEntry(null);
    await loadEntries();
    window.dispatchEvent(new Event("entry-updated"));
    if (updated.date !== date) {
      const movedTo = new Date(updated.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
      showToast(`Moved to ${movedTo}`);
    } else {
      showToast("Updated");
    }
  };

  const deleteTimeoutRef = useRef<NodeJS.Timeout>(undefined);

  const handleDelete = async (id: string) => {
    const entryToDelete = entries.find((e) => e.id === id);
    setSelectedEntry(null);

    // Remove from UI immediately
    setEntries((prev) => prev.filter((e) => e.id !== id));

    // Schedule actual delete
    if (deleteTimeoutRef.current) clearTimeout(deleteTimeoutRef.current);
    deleteTimeoutRef.current = setTimeout(async () => {
      await deleteEntry(id);
      window.dispatchEvent(new Event("entry-updated"));
    }, 5000);

    // Show undo toast
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    setToast(null);
    queueMicrotask(() => {
      setToast("__undo__");
    });

    undoRef.current = entryToDelete
      ? () => {
          if (deleteTimeoutRef.current) clearTimeout(deleteTimeoutRef.current);
          setEntries((prev) =>
            [...prev, entryToDelete].sort(
              (a, b) => (a.startTime || a.timestamp) - (b.startTime || b.timestamp)
            )
          );
          setToast(null);
        }
      : null;

    toastTimeout.current = setTimeout(() => setToast(null), 5000);
  };

  const undoRef = useRef<(() => void) | null>(null);

  const activeEntry = isToday ? entries.find((e) => e.endTime === 0) : null;

  // Render variables for new Timeline
  const sortedEntries = [...entries].sort((a, b) => (a.startTime || a.timestamp) - (b.startTime || b.timestamp));

  // Gap label quick-fill state
  const [expandedGapIdx, setExpandedGapIdx] = useState<number | null>(null);
  const [fillingGap, setFillingGap] = useState(false);
  const [gapCustomText, setGapCustomText] = useState("");
  const gapInputRef = useRef<HTMLInputElement>(null);

  const GAP_LABELS = [
    { text: "Resting", tag: "Self-Care", emoji: "😴" },
    { text: "Forgot to log", tag: "Other", emoji: "🤷" },
    { text: "Offline time", tag: "Self-Care", emoji: "📵" },
    { text: "Got distracted — it happens!", tag: "Leisure", emoji: "🐿️" },
  ];

  const handleFillGap = async (gapStart: number, gapEnd: number, label: { text: string; tag: string }) => {
    if (fillingGap) return;
    setFillingGap(true);
    try {
      const dateStr = new Date(gapStart).toISOString().split("T")[0];
      await addEntry({
        id: crypto.randomUUID(),
        text: label.text,
        timestamp: gapStart,
        startTime: gapStart,
        endTime: gapEnd,
        date: dateStr,
        location: null,
        tags: [label.tag],
        createdAt: Date.now(),
      });
      setExpandedGapIdx(null);
      setGapCustomText("");
      await loadEntries();
      showToast("Gap filled");
      window.dispatchEvent(new Event("entry-updated"));
    } finally {
      setFillingGap(false);
    }
  };

  const handleFillGapCustom = async (gapStart: number, gapEnd: number) => {
    const trimmed = gapCustomText.trim();
    if (!trimmed || fillingGap) return;
    setFillingGap(true);
    try {
      const dateStr = new Date(gapStart).toISOString().split("T")[0];

      const geminiResult = await categorizeEntry(trimmed, getCategoryNames(categories));

      await addEntry({
        id: crypto.randomUUID(),
        text: trimmed,
        timestamp: gapStart,
        startTime: gapStart,
        endTime: gapEnd,
        date: dateStr,
        location: null,
        tags: geminiResult.tags,
        createdAt: Date.now(),
      });
      setExpandedGapIdx(null);
      setGapCustomText("");
      await loadEntries();
      showToast("Logged");
      window.dispatchEvent(new Event("entry-updated"));
    } finally {
      setFillingGap(false);
    }
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (loading) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight; // Autoscroll to bottom most items (latest)
  }, [date, loading, entries.length]);

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Search bar */}
      <div className="flex items-center gap-2 mb-3">
        {searchOpen ? (
          <div className="flex-1 flex items-center gap-2 animate-fade-in">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <label htmlFor="timeline-search" className="sr-only">
                Search entries
              </label>
              <input
                id="timeline-search"
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search entries..."
                className="w-full h-11 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-opacity-40 placeholder:text-[var(--color-text-muted)]"
              />
            </div>
            <button
              onClick={toggleSearch}
              className="h-10 px-3 rounded-lg text-sm font-medium text-[var(--color-text-muted)] active:scale-95 transition-transform"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={toggleSearch}
            className="ml-auto min-w-11 min-h-11 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:shadow-sm active:scale-95 transition-all"
            aria-label="Search entries"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </button>
        )}
      </div>

      {searchOpen && searchQuery.trim() ? (
        <div className="flex flex-col gap-4 pb-4">
          {isSearching ? (
            <div className="flex flex-col gap-3 py-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 rounded-2xl animate-shimmer" />
              ))}
            </div>
          ) : searchResults.length === 0 ? (
            <div className="text-center py-12 animate-fade-in">
              <p className="text-sm font-medium text-[var(--color-text-muted)]">No results for &ldquo;{searchQuery}&rdquo;</p>
            </div>
          ) : (
            Object.entries(groupedResults).map(([dateKey, dateEntries]) => {
              const label = new Date(dateKey + "T12:00:00").toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
              });
              return (
                <div key={dateKey}>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-3 pl-2">
                    {dateKey === new Date().toISOString().split("T")[0] ? "Today" : label}
                  </h3>
                  <div className="flex flex-col gap-3">
                    {dateEntries.map((entry, i) => (
                      <div key={entry.id} style={{ opacity: 0, animation: `slideUp 0.3s var(--spring) ${i * 30}ms forwards` }}>
                        <TimelineEntry
                          entry={entry}
                          categories={categories}
                          onTap={setSelectedEntry}
                          showTimeOnCard
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        <>
      <WeekStrip
        selectedDate={date}
        onSelectDate={setDate}
        categories={categories}
      />

      <div className="flex items-center justify-between mb-5 px-1">
        <button
          onClick={() => shiftDate(-1)}
          className="min-w-10 min-h-10 rounded-full hover:bg-[var(--color-surface)] flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text)] active:scale-95 transition-all"
          aria-label="Previous day"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div className="text-center group cursor-pointer" onClick={() => setDate(new Date().toISOString().split("T")[0])}>
          <h2 className="text-[17px] font-bold tracking-tight">{isToday ? "Today" : displayDate}</h2>
          {isToday && (
            <p className="text-xs font-medium text-[var(--color-accent)] animate-pulse-soft mt-0.5">Logging Now</p>
          )}
        </div>
        <button
          onClick={() => shiftDate(1)}
          disabled={isToday}
          className="min-w-10 min-h-10 rounded-full hover:bg-[var(--color-surface)] flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-20 disabled:hover:bg-transparent active:scale-95 transition-all"
          aria-label="Next day"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>

      {isToday && (
        <div className="flex gap-2 mb-6">
          <input
            id="timeline-quick-add"
            name="timeline-quick-add"
            type="text"
            value={quickText}
            onChange={(e) => setQuickText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleQuickAdd();
            }}
            placeholder="Log an activity..."
            className="flex-1 h-12 rounded-xl border border-[var(--color-border)] shadow-sm bg-[var(--color-surface)] px-4 text-[15px] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-opacity-40 placeholder:text-[var(--color-text-muted)] transition-all"
          />
          <button
            onClick={handleQuickAdd}
            disabled={!quickText.trim() || isQuickSubmitting}
            className="h-12 px-5 rounded-xl bg-[var(--color-accent)] shadow-md shadow-[var(--color-accent)]/20 text-white font-semibold disabled:opacity-40 disabled:shadow-none active:scale-[0.98] transition-all"
          >
            {isQuickSubmitting ? "..." : "Log"}
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-5 py-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-4">
              <div className="w-[50px] shrink-0 h-4 mt-2 rounded bg-[var(--color-surface)] animate-shimmer" />
              <div className="flex-1 h-24 rounded-2xl animate-shimmer" />
            </div>
          ))}
        </div>
      ) : entries.length === 0 && !isToday ? (
        <div className="text-center py-20 flex flex-col items-center animate-fade-in">
          <div className="w-16 h-16 rounded-full bg-[var(--color-surface)] flex items-center justify-center mb-4 text-[var(--color-text-muted)] opacity-50">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </div>
          <p className="font-semibold text-[var(--color-text)]">Nothing logged</p>
          <p className="text-sm text-[var(--color-text-muted)] mt-1.5 opacity-80 max-w-[200px]">
            Every day doesn&apos;t need to be filled. Rest is good.
          </p>
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="overflow-y-auto pb-8 relative"
          style={{ maxHeight: "calc(100dvh - 280px)", scrollBehavior: "smooth" }}
        >
          {sortedEntries.length > 0 && (
            <div className="absolute left-[75px] top-6 bottom-4 w-px bg-gradient-to-b from-transparent via-[var(--color-border)] to-[var(--color-border)] opacity-60 z-0" />
          )}

          <div className="flex flex-col gap-5">
            {sortedEntries.map((entry, i) => {
              const isActive = activeEntry?.id === entry.id;
              const primaryStyle = getCategoryStyle(entry.tags[0] || "Other", categories);
              const startTime = entry.startTime || entry.timestamp;

              // Check if we should insert a visual duration gap
              let showGap = false;
              let gapText = "";
              let gapStart = 0;
              let gapEnd = 0;
              if (i > 0) {
                const prev = sortedEntries[i - 1];
                const prevEnd = prev.endTime === 0 ? now : (prev.endTime || prev.timestamp);
                const gapMins = Math.round((startTime - prevEnd) / 60000);
                if (gapMins >= 60) {
                  showGap = true;
                  gapStart = prevEnd;
                  gapEnd = startTime;
                  const h = Math.floor(gapMins / 60);
                  const m = gapMins % 60;
                  gapText = m > 0 ? `${h}h ${m}m` : `${h}h`;
                }
              }

              const isGapExpanded = expandedGapIdx === i;

              return (
                <div key={entry.id} className="relative group text-left">
                  {showGap && (
                    <div className="flex flex-col items-center -mt-2 mb-1 relative" style={{ zIndex: 2, marginLeft: 70 }}>
                      <button
                        onClick={() => setExpandedGapIdx(isGapExpanded ? null : i)}
                        className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[10px] font-semibold text-[var(--color-text-muted)] hover:border-[var(--color-accent)]/40 hover:text-[var(--color-accent)] active:scale-95 transition-all"
                      >
                        <span>{gapText} untracked</span>
                        <svg
                          width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                          className={`transition-transform duration-200 ${isGapExpanded ? "rotate-180" : ""}`}
                        >
                          <path d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {isGapExpanded && (
                        <div className="flex flex-col items-center gap-2 mt-2 animate-fade-in w-full">
                          <div className="flex flex-wrap gap-1.5 justify-center">
                            {GAP_LABELS.map((label) => (
                              <button
                                key={label.text}
                                disabled={fillingGap}
                                onClick={() => handleFillGap(gapStart, gapEnd, label)}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-medium border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-accent)]/40 hover:bg-[var(--color-accent-soft)] active:scale-95 transition-all disabled:opacity-50"
                              >
                                <span>{label.emoji}</span>
                                <span>{label.text}</span>
                              </button>
                            ))}
                          </div>
                          <div className="flex gap-1.5 w-full max-w-xs">
                            <input
                              id="gap-fill-custom"
                              name="gap-fill-custom"
                              ref={gapInputRef}
                              type="text"
                              value={gapCustomText}
                              onChange={(e) => setGapCustomText(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") handleFillGapCustom(gapStart, gapEnd); }}
                              placeholder="Or type what you were doing..."
                              disabled={fillingGap}
                              className="flex-1 h-9 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-opacity-40 placeholder:text-[var(--color-text-muted)] disabled:opacity-50 transition-all"
                            />
                            <button
                              onClick={() => handleFillGapCustom(gapStart, gapEnd)}
                              disabled={!gapCustomText.trim() || fillingGap}
                              className="h-9 px-3 rounded-lg bg-[var(--color-accent)] text-[var(--color-on-accent)] text-[11px] font-semibold disabled:opacity-40 active:scale-95 transition-all"
                            >
                              {fillingGap ? "..." : "Log"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex items-stretch gap-4 relative">
                    <div className="w-[50px] shrink-0 text-right pt-[11px] z-10">
                      <span className={`text-[12px] font-bold tracking-tight ${isActive ? "text-[var(--color-accent)] animate-pulse-soft" : "text-[var(--color-text-muted)]"}`}>
                        {formatTimeShort(startTime)}
                      </span>
                    </div>

                    <div className="relative flex flex-col items-center mx-1 z-10">
                      {/* Node Dot */}
                      <div 
                        className={`w-[13px] h-[13px] rounded-full border-4 shrink-0 transition-transform duration-300 group-hover:scale-125 ${isActive ? "border-[var(--color-bg)] outline outline-2 outline-[var(--color-accent)] shadow-[0_0_8px_var(--color-accent)] animate-pulse" : "border-[var(--color-bg)]"}`}
                        style={{ backgroundColor: primaryStyle.color, marginTop: '14px' }}
                      />
                    </div>

                    <div className="flex-1 mt-0.5" style={{ animation: `slideUp 0.3s var(--spring) ${i * 30}ms forwards`, opacity: 0 }}>
                      <TimelineEntry
                        entry={entry}
                        categories={categories}
                        onTap={setSelectedEntry}
                        showTimeOnCard={false}
                        style={isActive ? { boxShadow: `0 0 0 2px var(--color-accent)` } : undefined}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
            
            {/* End of line aesthetic */}
            {sortedEntries.length > 0 && !isToday && (
              <div className="flex items-center gap-4 mt-2">
                <div className="w-[50px] shrink-0" />
                <div className="w-[13px] h-[13px] rounded-full border-4 border-[var(--color-bg)] bg-[var(--color-border)] mx-1 shrink-0 mt-0" />
              </div>
            )}
            
            {/* Pulsing indicator for "Today" line end */}
            {isToday && (
              <div className="flex items-center gap-4 mt-2 mb-6">
                <div className="w-[50px] shrink-0 text-right pt-[2px]">
                   <span className="text-[10px] font-bold text-[var(--color-accent)] opacity-60">Now</span>
                </div>
                <div className="w-[13px] h-[13px] rounded-full border-[3px] border-[var(--color-bg)] bg-[var(--color-accent)] mx-1 shrink-0 animate-pulse-soft mt-0" />
              </div>
            )}
          </div>
        </div>
      )}
      </>
      )}

      <EntryEditSheet
        entry={selectedEntry}
        categories={categories}
        onClose={() => setSelectedEntry(null)}
        onSave={handleSave}
        onDelete={handleDelete}
      />

      {toast && (
        <div className="fixed above-nav left-1/2 -translate-x-1/2 z-[70] flex items-center gap-3 px-5 py-2.5 rounded-full bg-[var(--color-text)] text-[var(--color-bg)] text-sm font-medium shadow-lg animate-toast-in">
          <span>{toast === "__undo__" ? "Entry deleted" : toast}</span>
          {toast === "__undo__" && undoRef.current && (
            <button
              onClick={() => undoRef.current?.()}
              className="font-bold underline underline-offset-2"
            >
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}
