import { type Entry } from "./db";

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "as", "is", "was", "are", "were", "been",
  "be", "have", "has", "had", "do", "does", "did", "will", "would",
  "could", "should", "may", "might", "shall", "can", "need", "dare",
  "ought", "used", "not", "no", "nor", "so", "yet", "both", "either",
  "neither", "each", "every", "all", "any", "few", "more", "most",
  "other", "some", "such", "than", "too", "very", "just", "about",
  "above", "after", "again", "also", "am", "because", "before",
  "being", "below", "between", "both", "during", "further", "get",
  "got", "going", "gone", "here", "how", "if", "into", "its", "it",
  "itself", "let", "like", "made", "make", "many", "me", "mine", "much",
  "must", "my", "myself", "now", "off", "once", "only", "our", "out",
  "own", "put", "same", "she", "her", "hers", "he", "him", "his",
  "still", "take", "that", "their", "them", "then", "there", "these",
  "they", "this", "those", "through", "under", "until", "up", "upon",
  "us", "was", "we", "what", "when", "where", "which", "while", "who",
  "whom", "why", "will", "you", "your", "yours", "i", "really",
  "went", "had", "bit", "thing", "things", "way", "back", "lot",
  "started", "did", "doing", "done", "been", "came",
]);

export interface WordFrequency {
  word: string;
  count: number;
  /** Normalized weight 0–1 */
  weight: number;
}

export function getWordFrequencies(entries: Entry[], maxWords: number = 30): WordFrequency[] {
  const counts = new Map<string, number>();

  for (const entry of entries) {
    // Split on whitespace and punctuation, lowercase
    const words = entry.text
      .toLowerCase()
      .replace(/[^a-z\s'-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));

    for (const word of words) {
      counts.set(word, (counts.get(word) || 0) + 1);
    }
  }

  // Sort by frequency
  const sorted = [...counts.entries()]
    .filter(([, count]) => count >= 2) // Only words that appear 2+ times
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxWords);

  if (sorted.length === 0) return [];

  const maxCount = sorted[0][1];
  const minCount = sorted[sorted.length - 1][1];
  const range = maxCount - minCount || 1;

  return sorted.map(([word, count]) => ({
    word,
    count,
    weight: (count - minCount) / range,
  }));
}
