import type { Song } from "./song";

export type LibrarySort = "newest" | "oldest" | "rating" | "title";
type Project = { name: string; song: Song; createdAt: string };
type Options = { query: string; filter: string; sort: LibrarySort; minimumRating: number };
const titles = new Intl.Collator("en-US", { sensitivity: "base", numeric: true });

// Operate on latest snapshots only; filtering never changes saved data or history.
export function selectProjects<T extends Project>(projects: readonly T[], options: Options): T[] {
  const query = options.query.trim().toLowerCase();
  const date = (p: Project) => Date.parse(p.createdAt) || 0;
  const selected = projects.filter(({ song, name }) =>
    (options.filter === "all" ||
      (options.filter === "favorite" && song.favorite) ||
      song.kind === options.filter || song.stage === options.filter) &&
    song.rating >= options.minimumRating &&
    [song.title, song.style, song.prompt, song.notes, song.changeNote,
      song.referenceNotes, song.persona, song.voice, name].join(" ").toLowerCase().includes(query),
  );
  return selected.sort((a, b) => {
    if (options.sort === "title")
      return titles.compare(a.song.title || "Untitled idea", b.song.title || "Untitled idea") || date(b) - date(a);
    if (options.sort === "rating") return b.song.rating - a.song.rating || date(b) - date(a);
    return options.sort === "oldest" ? date(a) - date(b) : date(b) - date(a);
  });
}
