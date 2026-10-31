import { z } from "zod";
import { songSchema } from "./song";
import { fieldLabels } from "./presentation";

export const MAX_LIBRARY_BYTES = 20 * 1024 * 1024;
export const librarySchema = z
  .object({
    format: z.literal("sunomat-library-v1"),
    exportedAt: z.iso.datetime(),
    projects: z
      .array(
        z.object({
          name: z.string().min(1).max(200),
          // File order is authoritative: oldest to latest, even if timestamps match.
          versions: z
            .array(z.object({ createdAt: z.iso.datetime(), song: songSchema }))
            .min(1)
            .max(100),
        }),
      )
      .max(100),
  })
  .refine(
    (value) =>
      value.projects.reduce((total, p) => total + p.versions.length, 0) <= 100,
    {
      message: "A library backup can contain at most 100 saved versions",
    },
  );
export type LibraryArchive = z.infer<typeof librarySchema>;
export type LibraryImportResult = {
  projects: number;
  versions: number;
  usage: number;
};
export const libraryVersionCount = (archive: LibraryArchive) =>
  archive.projects.reduce((total, p) => total + p.versions.length, 0);

export function libraryValidationMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  if (issue.path[0] === "format")
    return "Choose a Sunomat library backup in sunomat-library-v1 format. Single-song setups belong in the composer.";
  const project =
    typeof issue.path[1] === "number"
      ? `Project ${issue.path[1] + 1}`
      : "Library backup";
  const version =
    typeof issue.path[3] === "number" ? `, version ${issue.path[3] + 1}` : "";
  const field =
    issue.path[4] === "song" && typeof issue.path[5] === "string"
      ? fieldLabels[issue.path[5] as keyof typeof fieldLabels]
      : undefined;
  return `${project}${version}${field ? `, ${field}` : ""}: ${issue.message}`;
}
export function parseLibrary(text: string): LibraryArchive {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(
      "This file is not valid JSON. Choose a Sunomat library backup.",
    );
  }
  const result = librarySchema.safeParse(value);
  if (!result.success) throw new Error(libraryValidationMessage(result.error));
  return result.data;
}
