import { z } from "zod";
import { songSchema, type Song } from "./song";
import { fieldLabels } from "./presentation";

export function formatValidationError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const key = issue.path[0] === "song" ? issue.path[1] : issue.path[0];
      const authLabels: Record<string, string> = {
        email: "Email",
        password: "Password",
        projectId: "Project ID",
        baseId: "Base version ID",
      };
      const label =
        typeof key === "string"
          ? fieldLabels[key as keyof Song] || authLabels[key] || "Setup"
          : "Setup";
      return `${label}: ${issue.message}`;
    })
    .join("; ");
}

export function parseSetup(text: string): Song {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      "This file is not valid JSON. Choose a Sunomat JSON setup.",
    );
  }
  if (
    data &&
    typeof data === "object" &&
    "format" in data &&
    data.format !== "sunomat-v1"
  ) {
    throw new Error(
      "This setup format is not supported. Export a Sunomat v1 setup and try again.",
    );
  }
  const input =
    data && typeof data === "object" && "song" in data ? data.song : data;
  const result = songSchema.safeParse(input);
  if (!result.success) throw new Error(formatValidationError(result.error));
  return result.data;
}
