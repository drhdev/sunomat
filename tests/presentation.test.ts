import { test } from "node:test";
import assert from "node:assert/strict";
import { emptySong } from "../shared/song";
import {
  compareSongs,
  fieldLabels,
  formatNumber,
  formatSavedDate,
} from "../shared/presentation";
import { parseSetup } from "../shared/setup";
import { api } from "../src/api";

test("English formatting and readable labels cover every editor field", () => {
  assert.equal(formatNumber(1000), "1,000");
  assert.match(formatSavedDate("2026-10-31T12:00:00Z"), /Oct 31, 2026/);
  assert.equal(formatSavedDate("invalid"), "Unknown date");
  assert.deepEqual(
    Object.keys(fieldLabels).sort(),
    Object.keys(emptySong()).sort(),
  );
});

test("comparison includes only changed fields without modifying either snapshot", () => {
  const before = emptySong();
  const after = {
    ...before,
    styleInfluence: 80,
    maxMode: true,
    lyrics: "[Chorus]\nAn original line",
    rating: 4,
  };
  const originalBefore = JSON.stringify(before);
  const originalAfter = JSON.stringify(after);
  const changes = compareSongs(before, after);
  assert.deepEqual(
    changes.map((c) => c.field),
    ["lyrics", "styleInfluence", "maxMode", "rating"],
  );
  assert.deepEqual(
    changes.find((c) => c.field === "styleInfluence"),
    {
      field: "styleInfluence",
      label: "Style influence",
      before: "75%",
      after: "80%",
    },
  );
  assert.equal(changes.find((c) => c.field === "maxMode")?.before, "Off");
  assert.equal(changes.find((c) => c.field === "rating")?.before, "Not rated");
  assert.equal(changes.find((c) => c.field === "lyrics")?.before, "Not set");
  assert.equal(JSON.stringify(before), originalBefore);
  assert.equal(JSON.stringify(after), originalAfter);
  assert.deepEqual(compareSongs(before, { ...before }), []);
});

test("imports accept existing setup formats and preserve multilingual user content", () => {
  const song = {
    ...emptySong(),
    title: "Moonlight",
    lyrics: "\u65e5\u672c\u8a9e\n\u00e9\u00e8\u00ea",
  };
  for (const data of [song, { song }, { format: "sunomat-v1", song }])
    assert.deepEqual(parseSetup(JSON.stringify(data)), song);
  assert.throws(() => parseSetup("{"), /This file is not valid JSON/);
  assert.throws(() => parseSetup("null"), /Setup:/);
  assert.throws(
    () => parseSetup(JSON.stringify({ format: "future-format", song })),
    /This setup format is not supported/,
  );
  assert.throws(
    () => parseSetup(JSON.stringify({ styleInfluence: 101 })),
    /Style influence:/,
  );
});

test("connection and malformed-response errors use app-owned English messages", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new TypeError("A browser-localized network failure");
  });
  await assert.rejects(
    api("/me"),
    /Cannot reach Sunomat\. Check your connection and try again\./,
  );
  t.mock.restoreAll();
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("<html>Proxy error</html>"),
  );
  await assert.rejects(
    api("/me"),
    /The server returned an unexpected response/,
  );
  t.mock.restoreAll();
  t.mock.method(globalThis, "fetch", async () => new Response("null"));
  await assert.rejects(
    api("/me"),
    /The server returned an unexpected response/,
  );
});
