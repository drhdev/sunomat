import type { Song } from "../shared/song";
export type User = { id: string; email: string };
export type Saved = {
  id: string;
  projectId: string;
  name: string;
  song: Song;
  createdAt: string;
  versions?: number;
};
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers:
        method === "GET"
          ? {}
          : { "Content-Type": "application/json", "X-Sunomat-Request": "1" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error(
      "Cannot reach Sunomat. Check your connection and try again.",
    );
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error("The server returned an unexpected response. Try again.");
  }
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new Error("The server returned an unexpected response. Try again.");
  if (!response.ok)
    throw new Error(
      "error" in data && typeof data.error === "string"
        ? data.error
        : "Request failed. Try again.",
    );
  return data as T;
}
export function download(name: string, text: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
