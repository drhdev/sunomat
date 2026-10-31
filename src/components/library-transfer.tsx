import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, Upload, ShieldCheck } from "lucide-react";
import { api, download } from "../api";
import {
  libraryVersionCount,
  MAX_LIBRARY_BYTES,
  parseLibrary,
  type LibraryArchive,
  type LibraryImportResult,
} from "../../shared/library";
import { formatSavedDate } from "../../shared/presentation";
import { Badge, Button, Dialog } from "./ui/primitives";

export function LibraryTransfer({
  usage,
  onImported,
  onNotice,
}: {
  usage: number;
  onImported: (result: LibraryImportResult) => void;
  onNotice: (message: string) => void;
}) {
  const [preview, setPreview] = useState<{
    name: string;
    archive: LibraryArchive;
  } | null>(null);
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const versions = preview ? libraryVersionCount(preview.archive) : 0;
  const available = 100 - usage;

  async function exportLibrary() {
    setBusy("export");
    setError("");
    try {
      const response = await api<unknown>("/library/export");
      if (!active.current) return;
      const archive = parseLibrary(JSON.stringify(response));
      download(
        `sunomat-library-${archive.exportedAt.slice(0, 10)}.json`,
        JSON.stringify(archive, null, 2),
        "application/json",
      );
      onNotice(
        "Library exported. Keep this backup private; it contains your lyrics and notes.",
      );
    } catch (e) {
      if (active.current) setError((e as Error).message);
    } finally {
      if (active.current) setBusy(null);
    }
  }
  async function inspect(file?: File) {
    if (!file) return;
    setError("");
    try {
      if (file.size > MAX_LIBRARY_BYTES)
        throw new Error(
          "This backup is too large. Library backups must be at most 20 MB.",
        );
      let text: string;
      try {
        text = await file.text();
      } catch {
        throw new Error(
          "This file could not be read. Choose a local library backup and try again.",
        );
      }
      const archive = parseLibrary(text);
      if (active.current) setPreview({ name: file.name, archive });
    } catch (e) {
      if (active.current) setError((e as Error).message);
    } finally {
      if (input.current) input.current.value = "";
    }
  }
  async function restore() {
    if (!preview || versions === 0 || versions > available) return;
    setBusy("import");
    setError("");
    try {
      const result = await api<LibraryImportResult>(
        "/library/import",
        "POST",
        preview.archive,
      );
      if (!active.current) return;
      setPreview(null);
      onImported(result);
      onNotice(
        `Imported ${result.projects} ${result.projects === 1 ? "project" : "projects"} with ${result.versions} saved ${result.versions === 1 ? "version" : "versions"}. Existing projects were kept.`,
      );
    } catch (e) {
      if (active.current) setError((e as Error).message);
    } finally {
      if (active.current) setBusy(null);
    }
  }

  return (
    <div className="library-transfer">
      <div className="library-transfer-actions">
        <span>
          <ShieldCheck size={14} />
          Your settings, kept portable.
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={Boolean(busy) || usage === 0}
          onClick={() => void exportLibrary()}
        >
          <ArrowDownToLine size={14} />
          {busy === "export" ? "Exporting…" : "Export library"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={Boolean(busy)}
          onClick={() => input.current?.click()}
        >
          <Upload size={14} />
          Import library backup
        </Button>
      </div>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        className="sr-only"
        aria-label="Choose library backup"
        onChange={(e) => void inspect(e.target.files?.[0])}
      />
      {error && !preview && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <Dialog
        open={Boolean(preview)}
        onOpenChange={(open) => {
          if (!open && busy !== "import") {
            setPreview(null);
            setError("");
          }
        }}
        title="Restore a library backup"
        description="Import creates new copies of every project and saved version. Existing projects are never changed. Importing the same backup again creates additional copies."
      >
        {preview && (
          <>
            <div className="backup-summary">
              <p>{preview.name}</p>
              <span>
                Exported {formatSavedDate(preview.archive.exportedAt)}
              </span>
              <div>
                <Badge>
                  {preview.archive.projects.length}{" "}
                  {preview.archive.projects.length === 1
                    ? "project"
                    : "projects"}
                </Badge>
                <Badge>
                  {versions} saved {versions === 1 ? "version" : "versions"}
                </Badge>
                <Badge>{available} save slots available</Badge>
              </div>
            </div>
            <ul
              className="backup-projects"
              aria-label="Projects in this backup"
            >
              {preview.archive.projects.map((project, i) => (
                <li key={i}>
                  <strong>
                    {project.versions.at(-1)!.song.title || "Untitled idea"}
                  </strong>
                  <span>
                    {project.versions.length}{" "}
                    {project.versions.length === 1 ? "version" : "versions"}
                  </span>
                </li>
              ))}
            </ul>
            {versions > available && (
              <p className="form-error" role="alert">
                This backup needs {versions} save slots, but only {available}{" "}
                are available. Free space or use another account before
                importing.
              </p>
            )}
            {versions === 0 && (
              <p className="field-hint">
                This backup is empty. There is nothing to import.
              </p>
            )}
            <p className="field-hint">
              History order, original timestamps, lyrics, templates and
              production notes are preserved. Every imported version counts
              toward your 100-version limit. If the connection is interrupted,
              check your library before retrying to avoid duplicate copies.
            </p>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="dialog-actions">
              <Button
                variant="outline"
                disabled={busy === "import"}
                onClick={() => {
                  setPreview(null);
                  setError("");
                }}
              >
                Cancel
              </Button>
              <Button
                disabled={
                  Boolean(busy) || versions === 0 || versions > available
                }
                onClick={() => void restore()}
              >
                {busy === "import"
                  ? "Importing…"
                  : `Import ${versions} saved ${versions === 1 ? "version" : "versions"}`}
              </Button>
            </div>
          </>
        )}
      </Dialog>
    </div>
  );
}
