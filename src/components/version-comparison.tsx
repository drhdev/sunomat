import type { Saved } from "../api";
import { compareSongs, formatSavedDate } from "../../shared/presentation";
import { Badge, Dialog } from "./ui/primitives";

export function VersionComparison({
  versions,
  onClose,
}: {
  versions: { before: Saved; after: Saved } | null;
  onClose: () => void;
}) {
  const changes = versions
    ? compareSongs(versions.before.song, versions.after.song)
    : [];
  return (
    <Dialog
      open={Boolean(versions)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Compare saved versions"
      description="Review the exact changes between an earlier snapshot and the latest saved version. Comparing does not save or modify either version."
    >
      {versions && (
        <>
          <div className="comparison-summary">
            <Badge>
              {changes.length}{" "}
              {changes.length === 1 ? "field changed" : "fields changed"}
            </Badge>
            <p>{versions.after.song.title || "Untitled idea"}</p>
          </div>
          <div className="comparison-dates">
            <p>
              <strong>Earlier version</strong>
              <span>{formatSavedDate(versions.before.createdAt)}</span>
            </p>
            <p>
              <strong>Latest version</strong>
              <span>{formatSavedDate(versions.after.createdAt)}</span>
            </p>
          </div>
          {changes.length === 0 ? (
            <p className="comparison-empty">
              These versions have identical settings and production notes.
            </p>
          ) : (
            <div className="comparison-list">
              {changes.map((change) => (
                <article
                  key={change.field}
                  aria-label={`${change.label} comparison`}
                >
                  <h3>{change.label}</h3>
                  <div className="comparison-values">
                    <div>
                      <span>Earlier</span>
                      <pre>{change.before}</pre>
                    </div>
                    <div>
                      <span>Latest</span>
                      <pre>{change.after}</pre>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
          <p className="field-hint">
            Listen to both results before deciding which change helped.
            Identical settings can still produce different music.
          </p>
        </>
      )}
    </Dialog>
  );
}
