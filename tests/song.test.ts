import { test } from "node:test";
import assert from "node:assert/strict";
import { advise, emptySong, handoff, songSchema } from "../shared/song";

test("guidance catches specific contradictions and risky lyric formatting", () => {
  const song = {
    ...emptySong(),
    style: "indie folk, no drums, felt piano, weirdness 20",
    exclude: "felt piano",
    lyrics: "[Verse]\n(whispering)\nA short line",
    variety: 50,
  };
  const titles = advise(song).map((a) => a.title);
  for (const title of [
    "Move exclusions out of Style",
    "Resolve a conflicting instruction",
    "Set sliders with the controls",
    "Keep directions in square brackets",
    "Keep comparisons controlled",
  ])
    assert.ok(titles.includes(title), title);
  assert.ok(
    advise({ ...song, instrumental: true, style: "choir, female vocals" }).some(
      (a) => a.field === "instrumental",
    ),
  );
});
test("limits are real schema contracts while incomplete drafts remain saveable", () => {
  assert.equal(songSchema.safeParse({}).success, true);
  assert.equal(
    songSchema.safeParse({ lyrics: "x".repeat(5001) }).success,
    false,
  );
  assert.equal(songSchema.safeParse({ duration: 9 }).success, false);
  assert.equal(songSchema.safeParse({ rating: 6 }).success, false);
});
test("handoff respects mode, instrumental state and conditional audio controls", () => {
  const song = {
    ...emptySong(),
    title: "Test",
    style: "ambient",
    lyrics: "private lyric draft",
    instrumental: true,
  };
  assert.ok(!handoff(song).includes("private lyric draft"));
  assert.ok(!handoff(song).includes("Audio influence"));
  assert.ok(
    handoff({ ...song, hasAudio: true }).includes("Audio influence: 50%"),
  );
  const simple = handoff({ ...song, mode: "simple", prompt: "A piano song" });
  assert.ok(simple.includes("A piano song"));
  assert.ok(!simple.includes("Style influence"));
});
