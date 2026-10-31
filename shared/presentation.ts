import type { Song } from "./song";

// App-owned text stays English regardless of the browser's preferred language.
// User-written titles, lyrics and notes are never translated or rewritten.
export const APP_LOCALE = "en-US";
const numberFormatter = new Intl.NumberFormat(APP_LOCALE);
const dateFormatter = new Intl.DateTimeFormat(APP_LOCALE, {
  dateStyle: "medium",
  timeStyle: "short",
});
export const formatNumber = (value: number) => numberFormatter.format(value);
export function formatSavedDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unknown date"
    : dateFormatter.format(date);
}

// Exhaustive typing makes every new editor field require a readable label.
export const fieldLabels: Record<keyof Song, string> = {
  title: "Song title",
  mode: "Creation mode",
  model: "Suno model",
  customModel: "Custom model name",
  prompt: "Simple prompt",
  style: "Style of music",
  lyrics: "Lyrics",
  exclude: "Exclude styles",
  instrumental: "Instrumental",
  vocalGender: "Vocal gender",
  weirdness: "Weirdness",
  styleInfluence: "Style influence",
  variety: "Variety",
  audioInfluence: "Audio influence",
  maxMode: "Max Mode",
  hasAudio: "Audio reference",
  referenceNotes: "Reference notes",
  persona: "Persona",
  voice: "Voice",
  myTaste: "My Taste",
  language: "Lyric language",
  duration: "Target duration",
  bpm: "Tempo",
  musicalKey: "Key / time signature",
  stage: "Production stage",
  kind: "Setup type",
  favorite: "Favorite setup",
  rating: "Result rating",
  notes: "Listening & production notes",
  changeNote: "Change for this take",
  resultUrl: "Result URL",
};

export function formatFieldValue(
  field: keyof Song,
  value: Song[keyof Song],
): string {
  if (typeof value === "boolean") return value ? "On" : "Off";
  if (typeof value === "number") {
    const formatted = formatNumber(value);
    if (
      ["weirdness", "styleInfluence", "variety", "audioInfluence"].includes(
        field,
      )
    )
      return `${formatted}%`;
    if (field === "duration") return `${formatted} minutes`;
    if (field === "bpm") return `${formatted} BPM`;
    if (field === "rating")
      return value === 0 ? "Not rated" : `${formatted} / 5`;
    return formatted;
  }
  if (value === "") return "Not set";
  const choices: Record<string, string> = {
    custom: "Custom",
    simple: "Simple",
    unspecified: "No preference",
    male: "Male",
    female: "Female",
    idea: "Idea",
    draft: "Draft",
    testing: "Testing",
    finished: "Finished",
    song: "Song project",
    template: "Reusable template",
  };
  return ["mode", "vocalGender", "stage", "kind"].includes(field)
    ? choices[value] || value
    : value;
}

export type FieldChange = {
  field: keyof Song;
  label: string;
  before: string;
  after: string;
};
export function compareSongs(before: Song, after: Song): FieldChange[] {
  return (Object.keys(fieldLabels) as (keyof Song)[])
    .filter((field) => before[field] !== after[field])
    .map((field) => ({
      field,
      label: fieldLabels[field],
      before: formatFieldValue(field, before[field]),
      after: formatFieldValue(field, after[field]),
    }));
}
