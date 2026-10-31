import type { Song } from "../../shared/song";
import type { Saved } from "../api";
import { compareSongs, formatSavedDate } from "../../shared/presentation";
import { Badge, Dialog } from "./ui/primitives";

export type Comparison =
  | { before: Saved; after: Saved }
  | { before: Saved; draft: Song };

export function VersionComparison({
  versions,
  onClose,
}: {
  versions: Comparison | null;
  onClose: () => void;
}) {
  const isDraft = versions !== null && "draft" in versions;
  const after =
    versions && ("draft" in versions ? versions.draft : versions.after.song);
  const changes =
    versions && after ? compareSongs(versions.before.song, after) : [];
  const beforeLabel = isDraft ? "Loaded snapshot" : "Earlier";
  const afterLabel = isDraft ? "Current draft" : "Latest";
  return (
    <Dialog
      open={Boolean(versions)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={isDraft ? "Review draft changes" : "Compare saved versions"}
      description={
        isDraft
          ? "Compare your current draft with the saved snapshot you loaded. This is not a check against newer saves in another tab. Reviewing does not save or use a version slot."
          : "Review the exact changes between an earlier snapshot and the latest saved version. Comparing does not save or modify either version."
      }
    >
      {versions && (
        <>
          <div className="comparison-summary">
            <Badge>
              {changes.length}{" "}
              {changes.length === 1 ? "field changed" : "fields changed"}
            </Badge>
            <p>{after?.title || "Untitled idea"}</p>
          </div>
          <div className="comparison-dates">
            <p>
              <strong>
                {isDraft ? "Loaded saved snapshot" : "Earlier version"}
              </strong>
              <span>{formatSavedDate(versions.before.createdAt)}</span>
            </p>
            <p>
              <strong>{isDraft ? "Current draft" : "Latest version"}</strong>
              <span>
                {"draft" in versions
                  ? "Not saved"
                  : formatSavedDate(versions.after.createdAt)}
              </span>
            </p>
          </div>
          {changes.length === 0 ? (
            <p className="comparison-empty">
              {isDraft
                ? "No changes since the loaded snapshot."
                : "These versions have identical settings and production notes."}
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
                      <span>{beforeLabel}</span>
                      <pre>{change.before}</pre>
                    </div>
                    <div>
                      <span>{afterLabel}</span>
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
