import { z } from "zod";

export const songSchema = z.object({
  title: z.string().max(120).default(""),
  mode: z.enum(["custom", "simple"]).default("custom"),
  model: z.enum(["v6", "v6-wild", "v6-mini", "custom"]).default("v6"),
  customModel: z.string().max(200).default(""),
  prompt: z.string().max(5000).default(""),
  style: z.string().max(1000).default(""),
  lyrics: z.string().max(5000).default(""),
  exclude: z.string().max(1000).default(""),
  instrumental: z.boolean().default(false),
  vocalGender: z.enum(["unspecified", "male", "female"]).default("unspecified"),
  weirdness: z.number().int().min(0).max(100).default(40),
  styleInfluence: z.number().int().min(0).max(100).default(75),
  variety: z.number().int().min(0).max(100).default(0),
  audioInfluence: z.number().int().min(0).max(100).default(50),
  maxMode: z.boolean().default(false),
  hasAudio: z.boolean().default(false),
  referenceNotes: z.string().max(2000).default(""),
  persona: z.string().max(300).default(""),
  voice: z.string().max(300).default(""),
  myTaste: z.boolean().default(false),
  language: z.string().max(100).default("English"),
  duration: z.number().min(0.25).max(8).default(3),
  bpm: z.number().int().min(20).max(300).default(100),
  musicalKey: z.string().max(100).default(""),
  stage: z.enum(["idea", "draft", "testing", "finished"]).default("idea"),
  kind: z.enum(["song", "template"]).default("song"),
  favorite: z.boolean().default(false),
  rating: z.number().int().min(0).max(5).default(0),
  notes: z.string().max(5000).default(""),
  changeNote: z.string().max(500).default(""),
  resultUrl: z
    .union([
      z.literal(""),
      z
        .url()
        .max(2000)
        .refine((v) => /^https?:\/\//i.test(v), "Use an HTTP or HTTPS URL"),
    ])
    .default(""),
});
export type Song = z.infer<typeof songSchema>;
export const emptySong = (): Song => songSchema.parse({});
export const sources = {
  sonoya: "https://sonoya.com/suno-v6-anleitung-eigene-songs-mit-ki-erstellen/",
  v6: "https://help.suno.com/en/articles/13924481",
  models: "https://help.suno.com/en/articles/13924801",
  sliders: "https://help.suno.com/en/articles/6141377",
};

export const tagGroups: Record<string, string[]> = {
  Genre: [
    "indie folk",
    "synth-pop",
    "acoustic pop",
    "alternative rock",
    "modern R&B",
    "lo-fi hip hop",
    "deep house",
    "techno",
    "ambient",
    "jazz",
    "soul",
    "cinematic",
    "country",
    "funk",
    "drum and bass",
    "gospel",
    "bossa nova",
    "schlager",
  ],
  Mood: [
    "warm",
    "nostalgic",
    "dreamy",
    "melancholic",
    "hopeful",
    "euphoric",
    "intimate",
    "dark",
    "energetic",
    "laid-back",
    "tense",
    "playful",
  ],
  Instruments: [
    "fingerpicked acoustic guitar",
    "felt piano",
    "brushed drums",
    "upright bass",
    "analog synth pads",
    "arpeggiated synth",
    "808 bass",
    "clean electric guitar",
    "string section",
    "Rhodes",
    "tight snare",
    "cello",
  ],
  Vocals: [
    "soft female vocals",
    "gritty male vocals",
    "breathy vocals",
    "falsetto vocals",
    "duet",
    "choir",
    "harmonies",
    "spoken word",
    "rap verses with sung chorus",
    "instrumental",
  ],
  Production: [
    "intimate dry mix",
    "close-mic",
    "wide stereo",
    "lo-fi tape warmth",
    "spacious reverb",
    "glossy polished mix",
    "minimal arrangement",
    "live feel",
    "80s inspired",
    "radio mix",
  ],
  Rhythm: [
    "72 BPM",
    "92 BPM",
    "120 BPM",
    "128 BPM",
    "half-time",
    "four on the floor",
    "shuffle",
    "syncopated",
    "swung",
  ],
};
export const sectionTags = [
  "Intro",
  "Verse 1",
  "Pre-Chorus",
  "Chorus",
  "Verse 2",
  "Bridge",
  "Instrumental Break",
  "Build",
  "Drop",
  "Breakdown",
  "Outro",
];
// Original examples: no third-party lyrics or copied example prompts.
export const presets: {
  name: string;
  description: string;
  song: Partial<Song>;
}[] = [
  {
    name: "Porchlight folk",
    description: "Acoustic · warm · intimate",
    song: {
      style:
        "indie folk, 92 BPM, hopeful, fingerpicked acoustic guitar, felt piano, soft female vocals, intimate dry mix",
      bpm: 92,
      exclude: "distorted guitars, electronic drums",
      weirdness: 35,
      styleInfluence: 75,
    },
  },
  {
    name: "After-hours synth",
    description: "Electronic · nostalgic · wide",
    song: {
      style:
        "synth-pop, 118 BPM, nostalgic, arpeggiated synth, tight snare, breathy vocals, wide stereo",
      bpm: 118,
      exclude: "acoustic guitar, choir",
      weirdness: 40,
      styleInfluence: 75,
    },
  },
  {
    name: "Quiet orbit",
    description: "Ambient · instrumental · sparse",
    song: {
      style:
        "ambient, 72 BPM, dreamy, felt piano, analog synth pads, instrumental, spacious reverb",
      bpm: 72,
      instrumental: true,
      weirdness: 45,
      styleInfluence: 70,
    },
  },
];

export type Advice = {
  field: keyof Song;
  level: "tip" | "warning";
  title: string;
  detail: string;
  source: keyof typeof sources;
};
export function advise(s: Song): Advice[] {
  const a: Advice[] = [];
  const add = (
    field: keyof Song,
    title: string,
    detail: string,
    level: Advice["level"] = "tip",
    source: Advice["source"] = "sonoya",
  ) => a.push({ field, title, detail, level, source });
  if (!s.title.trim())
    add(
      "title",
      "Give this idea a name",
      "A working title is enough. Saved projects receive a unique title-derived name.",
    );
  if (s.mode === "simple") {
    if (!s.prompt.trim())
      add(
        "prompt",
        "Describe the whole idea",
        "Include the sound, subject and desired development, for example: a warm piano-led song about finding your way home.",
      );
  } else {
    if (!s.style.trim())
      add(
        "style",
        "Start with a sonic anchor",
        "Try genre → tempo → mood → instruments → vocals → production. Choose a few specific descriptors.",
      );
    const parts = s.style
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (parts.length > 10 || s.style.length > 650)
      add(
        "style",
        "Give each word a job",
        "Trim competing ideas. The guide suggests roughly 4–7 focused descriptors, not filling the character allowance.",
        "warning",
      );
    if (new Set(parts.map((t) => t.toLowerCase())).size < parts.length)
      add(
        "style",
        "Remove repeated tags",
        "Repeating a descriptor adds clutter. Keep one occurrence of each idea.",
      );
    if (/\b(no|without|avoid|kein|keine|ohne)\s+\w/i.test(s.style))
      add(
        "style",
        "Move exclusions out of Style",
        "Put unwanted instruments or sounds in Exclude, without “no” or “without”.",
        "warning",
      );
    if (/\b(masterpiece|4k|ultra realistic|best quality)\b/i.test(s.style))
      add(
        "style",
        "Describe a sound, not a quality label",
        "Use concrete production language such as dry mix or wide stereo. Image-generation quality words have no established musical benefit.",
      );
    if (/\b(weirdness|style influence|variety)\s*[:=]?\s*\d/i.test(s.style))
      add(
        "style",
        "Set sliders with the controls",
        "Writing slider values in Style does not change Suno’s controls.",
        "warning",
      );
    if (/in the style of|sounds like/i.test(s.style))
      add(
        "style",
        "Describe the musical character",
        "Use timbre, instrumentation and arrangement instead of an artist-name comparison.",
      );
    if (
      s.style &&
      !/\b\d{2,3}\s*bpm\b|tempo|slow|fast|half-time/i.test(s.style)
    )
      add(
        "style",
        "Add a tempo or feel",
        "For example 92 BPM or laid-back half-time. Tempo in the brief below is planning metadata until added to Style.",
      );
    const style = s.style.toLowerCase();
    const excluded = s.exclude
      .toLowerCase()
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    if (excluded.some((t) => t.length > 2 && style.includes(t)))
      add(
        "exclude",
        "Resolve a conflicting instruction",
        "An excluded phrase also appears in Style. Decide which direction you want.",
        "warning",
      );
    if (/\b(no|without|avoid)\b/i.test(s.exclude))
      add(
        "exclude",
        "List only unwanted elements",
        "For example: distorted guitars, autotune. Negation words are unnecessary here.",
      );
    if (s.instrumental && /\b(vocals|singer|duet|choir|rap)\b/i.test(s.style))
      add(
        "instrumental",
        "Check the vocal direction",
        "Instrumental is on, but Style requests vocals. Remove the conflicting vocal description.",
        "warning",
      );
    if (s.instrumental && s.lyrics.replace(/\[[^\]]*\]/g, "").trim())
      add(
        "lyrics",
        "Lyrics are kept but not copied",
        "Instrumental is on. Your text is retained for later; the Suno handoff omits sung lyrics.",
        "warning",
      );
    if (!s.instrumental && !s.lyrics.trim())
      add(
        "lyrics",
        "Shape the first section",
        "Add original words below [Verse 1], then a memorable [Chorus]. A partial draft can be saved at any time.",
      );
    if (
      s.lyrics &&
      !/\[(Verse|Chorus|Intro|Build|Drop|Instrumental)/i.test(s.lyrics)
    )
      add(
        "lyrics",
        "Give the lyrics a structure",
        "Place section labels such as [Verse 1] and [Chorus] on their own lines.",
        "warning",
      );
    if (
      (s.lyrics.match(/\[/g) || []).length !==
      (s.lyrics.match(/\]/g) || []).length
    )
      add(
        "lyrics",
        "Close your section brackets",
        "An unmatched square bracket can make the boundary between lyrics and directions unclear.",
        "warning",
      );
    if (
      s.lyrics
        .split("\n")
        .some((l) => !l.startsWith("[") && l.trim().split(/\s+/).length > 16)
    )
      add(
        "lyrics",
        "Try shorter lyric lines",
        "Long lines can rush the delivery. Keep one image per line and similar lengths within a section. This is a heuristic, not a syllable count.",
      );
    if (/\((whisper|sing softly|drums enter|guitar solo)/i.test(s.lyrics))
      add(
        "lyrics",
        "Keep directions in square brackets",
        "Round brackets can be sung as ad-libs. Move performance directions into a section tag.",
        "warning",
      );
    if (/\[(Fade Out|End|Silence)\]/i.test(s.lyrics))
      add(
        "lyrics",
        "Keep the ending simple",
        "One [Outro] with a short direction is usually enough; stacked ending commands have no proven advantage.",
      );
    if (s.variety > 0)
      add(
        "variety",
        "Keep comparisons controlled",
        "Variety can rewrite style prompts. Use 0 when testing a specific change.",
        "tip",
        "v6",
      );
    if (!s.maxMode && (s.duration > 2 || /cover/i.test(s.referenceNotes)))
      add(
        "maxMode",
        "Consider Max Mode for the final take",
        "Suno recommends it for longer songs, close covers and consistency. It costs more credits; short idea tests can stay in standard mode.",
        "tip",
        "v6",
      );
    if (s.model === "v6-wild")
      add(
        "model",
        "Exploration over repeatability",
        "v6-wild is deliberately less predictable. Try v6 when refining a consistent sound.",
        "tip",
        "models",
      );
    if (s.model === "custom" && !s.customModel.trim())
      add(
        "customModel",
        "Record the custom model name",
        "Save the exact model selected in Suno so you can reproduce your setup.",
      );
    if (
      !s.instrumental &&
      s.vocalGender !== "unspecified" &&
      !s.style.toLowerCase().includes(s.vocalGender)
    )
      add(
        "vocalGender",
        "Describe the voice in Style too",
        "The gender selector is a direction. Add the desired delivery or timbre, for example gritty male vocals.",
      );
    if (s.hasAudio && !s.referenceNotes.trim())
      add(
        "referenceNotes",
        "Identify the reference",
        "Record which source you will attach in Suno, and what should be retained. Sunomat stores notes, not audio files.",
      );
  }
  if (!s.changeNote.trim())
    add(
      "changeNote",
      "Document one deliberate change",
      "Before a new test, record what changed. Listen to both Suno results and keep notes on the one you prefer.",
    );
  if (s.stage === "finished" && !s.resultUrl)
    add(
      "resultUrl",
      "Link the result you liked",
      "Add a Suno result URL and rating so a successful setup is easy to find again.",
    );
  return a;
}
export function handoff(s: Song): string {
  return [
    `Title: ${s.title || "Untitled idea"}`,
    `Mode: ${s.mode}`,
    `Model: ${s.model === "custom" ? s.customModel : s.model}`,
    ...(s.mode === "simple"
      ? [`Prompt:\n${s.prompt}`]
      : [
          `Style:\n${s.style}`,
          `Exclude:\n${s.exclude}`,
          `Instrumental: ${s.instrumental ? "On" : "Off"}`,
          `Lyrics:\n${s.instrumental ? "" : s.lyrics}`,
          `Vocal gender: ${s.vocalGender}`,
          `Weirdness: ${s.weirdness}%`,
          `Style influence: ${s.styleInfluence}%`,
          `Variety: ${s.variety}%`,
          `Max Mode: ${s.maxMode ? "On" : "Off"}`,
          ...(s.hasAudio ? [`Audio influence: ${s.audioInfluence}%`] : []),
          `Persona: ${s.persona || "None"}`,
          `Voice: ${s.voice || "None"}`,
          `My Taste: ${s.myTaste ? "On" : "Off"}`,
        ]),
    ...(s.referenceNotes
      ? [`References to attach in Suno:\n${s.referenceNotes}`]
      : []),
    `Planning brief (apply manually): ${s.language}; target ${s.duration} min; ${s.bpm} BPM${s.musicalKey ? `; ${s.musicalKey}` : ""}`,
  ].join("\n\n");
}
