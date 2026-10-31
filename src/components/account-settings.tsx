import { useEffect, useRef, useState } from "react";
import { FolderOpen, KeyRound, LogOut, Trash2 } from "lucide-react";
import { api, type User } from "../api";
import {
  passwordChangeFormSchema,
  deleteAccountSchema,
} from "../../shared/identity";
import { formatValidationError } from "../../shared/setup";
import { Badge, Button, Dialog, Input } from "./ui/primitives";

export function AccountSettings({
  user,
  usage,
  open,
  onOpenChange,
  onOpenLibrary,
  onSignOut,
  onPasswordChanged,
  onDeleted,
}: {
  user: User | null;
  usage: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenLibrary: () => void;
  onSignOut: () => void;
  onPasswordChanged: () => void;
  onDeleted: () => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [deletionPassword, setDeletionPassword] = useState("");
  const [confirmationEmail, setConfirmationEmail] = useState("");
  const [changeError, setChangeError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<"password" | "delete" | null>(null);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  function clear() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setDeletionPassword("");
    setConfirmationEmail("");
    setChangeError("");
    setDeleteError("");
    setMessage("");
  }
  function close(next: boolean) {
    if (busy) return;
    if (!next) clear();
    onOpenChange(next);
  }
  async function change() {
    const result = passwordChangeFormSchema.safeParse({
      currentPassword,
      newPassword,
      confirmPassword,
    });
    if (!result.success) {
      setChangeError(formatValidationError(result.error));
      return;
    }
    setBusy("password");
    setChangeError("");
    setMessage("");
    try {
      await api("/account/password", "POST", {
        currentPassword: result.data.currentPassword,
        newPassword: result.data.newPassword,
      });
      if (!active.current) return;
      clear();
      setMessage(
        "Password updated. Other sessions have been signed out. This session stays active.",
      );
      onPasswordChanged();
    } catch (e) {
      if (active.current) setChangeError((e as Error).message);
    } finally {
      if (active.current) setBusy(null);
    }
  }
  async function remove() {
    const result = deleteAccountSchema.safeParse({
      currentPassword: deletionPassword,
      confirmationEmail,
    });
    if (!result.success) {
      setDeleteError(formatValidationError(result.error));
      return;
    }
    if (result.data.confirmationEmail !== user?.email) {
      setDeleteError("The confirmation email does not match this account.");
      return;
    }
    setBusy("delete");
    setDeleteError("");
    try {
      await api("/account", "DELETE", result.data);
      if (active.current) {
        clear();
        onDeleted();
      }
    } catch (e) {
      if (active.current) setDeleteError((e as Error).message);
    } finally {
      if (active.current) setBusy(null);
    }
  }
  return (
    <Dialog
      open={open && Boolean(user)}
      onOpenChange={close}
      dismissible={!busy}
      title="Account settings"
      description={`Signed in as ${user?.email || ""}. Your song settings are private.`}
    >
      <div className="account-overview">
        <Badge>{usage} / 100 saved versions</Badge>
        <div>
          <Button
            variant="outline"
            size="sm"
            disabled={Boolean(busy)}
            onClick={() => {
              clear();
              onOpenLibrary();
            }}
          >
            <FolderOpen size={14} />
            Open library
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={Boolean(busy)}
            onClick={() => {
              clear();
              onSignOut();
            }}
          >
            <LogOut size={14} />
            Sign out
          </Button>
        </div>
      </div>
      <section className="account-section">
        <h2>
          <KeyRound size={16} />
          Change your password
        </h2>
        <p>
          Use a unique password of 12–128 characters. You will stay signed in
          here; other sessions will be revoked.
        </p>
        <form
          aria-label="Change password"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void change();
          }}
        >
          <div className="field">
            <label htmlFor="current-password">Current password</label>
            <Input
              id="current-password"
              type="password"
              required
              autoComplete="current-password"
              value={currentPassword}
              maxLength={128}
              disabled={Boolean(busy)}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="new-password">New password</label>
              <Input
                id="new-password"
                type="password"
                required
                autoComplete="new-password"
                value={newPassword}
                maxLength={128}
                disabled={Boolean(busy)}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="confirm-password">Confirm new password</label>
              <Input
                id="confirm-password"
                type="password"
                required
                autoComplete="new-password"
                value={confirmPassword}
                maxLength={128}
                disabled={Boolean(busy)}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </div>
          </div>
          {changeError && (
            <p className="form-error" role="alert">
              {changeError}
            </p>
          )}
          {message && (
            <p className="account-success" role="status">
              {message}
            </p>
          )}
          <Button disabled={Boolean(busy)}>
            {busy === "password" ? "Updating…" : "Update password"}
          </Button>
        </form>
      </section>
      <details className="account-danger">
        <summary>
          <Trash2 size={15} />
          Delete account
        </summary>
        <p>
          This permanently removes your account, every song and template, all
          saved versions and all sessions. Your current draft is cleared too.
          Export your library and any unsaved draft first if you want to keep
          them. Previously downloaded backups are not deleted.
        </p>
        <form
          aria-label="Delete account"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void remove();
          }}
        >
          <div className="field">
            <label htmlFor="delete-email">Confirm account email</label>
            <Input
              id="delete-email"
              type="email"
              required
              autoComplete="off"
              maxLength={254}
              value={confirmationEmail}
              placeholder={user?.email}
              disabled={Boolean(busy)}
              onChange={(event) => setConfirmationEmail(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="delete-password">Account password</label>
            <Input
              id="delete-password"
              type="password"
              required
              autoComplete="current-password"
              maxLength={128}
              value={deletionPassword}
              disabled={Boolean(busy)}
              onChange={(event) => setDeletionPassword(event.target.value)}
            />
          </div>
          {deleteError && (
            <p className="form-error" role="alert">
              {deleteError}
            </p>
          )}
          <Button variant="destructive" disabled={Boolean(busy)}>
            {busy === "delete"
              ? "Deleting account…"
              : "Delete my account permanently"}
          </Button>
        </form>
      </details>
    </Dialog>
  );
}
