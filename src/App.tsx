import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AudioLines,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Copy,
  FileText,
  FolderOpen,
  GitCompareArrows,
  History,
  Info,
  Layers3,
  Lightbulb,
  LogOut,
  Moon,
  Music2,
  Plus,
  RotateCcw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  Sun,
  Trash2,
  Upload,
  UserRound,
  WandSparkles,
  X,
} from "lucide-react";
import {
  Button,
  Badge,
  Card,
  Dialog,
  Input,
  Textarea,
  cn,
} from "./components/ui/primitives";
import {
  advise,
  emptySong,
  handoff,
  presets,
  sectionTags,
  sources,
  tagGroups,
  type Advice,
  type Song,
} from "../shared/song";
import { api, download, type Saved, type User } from "./api";
import {
  fieldLabels,
  formatNumber,
  formatSavedDate as date,
} from "../shared/presentation";
import { formatValidationError, parseSetup } from "../shared/setup";
import { credentialsSchema } from "../shared/identity";
import { VersionComparison } from "./components/version-comparison";
import { LibraryTransfer } from "./components/library-transfer";
import { AccountSettings } from "./components/account-settings";

type View = "compose" | "library" | "guide";
type Step = "sound" | "lyrics" | "controls" | "production";
const stepList: {
  id: Step;
  name: string;
  icon: typeof Music2;
  detail: string;
}[] = [
  {
    id: "sound",
    name: "Sound & style",
    icon: AudioLines,
    detail: "Define your direction",
  },
  {
    id: "lyrics",
    name: "Lyrics & structure",
    icon: FileText,
    detail: "Give your song a story",
  },
  {
    id: "controls",
    name: "Fine-tune",
    icon: SlidersHorizontal,
    detail: "Dial in the details",
  },
  {
    id: "production",
    name: "Production notes",
    icon: Layers3,
    detail: "Learn from every take",
  },
];

export default function App() {
  const [song, setSong] = useState<Song>(emptySong);
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [registration, setRegistration] = useState(true);
  const [usage, setUsage] = useState(0);
  const [view, setView] = useState<View>("compose");
  const [step, setStep] = useState<Step>("sound");
  const [active, setActive] = useState<Saved | null>(null);
  const [baseId, setBaseId] = useState<string>();
  const [baseline, setBaseline] = useState(JSON.stringify(emptySong()));
  const [projects, setProjects] = useState<Saved[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [auth, setAuth] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains("dark"),
  );
  const [copied, setCopied] = useState("");
  const [group, setGroup] = useState("Genre");
  const [tagQuery, setTagQuery] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [history, setHistory] = useState<Saved[] | null>(null);
  const [historyName, setHistoryName] = useState("");
  const [comparison, setComparison] = useState<{
    before: Saved;
    after: Saved;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    type: "project" | "version";
  } | null>(null);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [adviceField, setAdviceField] = useState<string>("all");
  const lyricsRef = useRef<HTMLTextAreaElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const libraryRequest = useRef(0);
  const accountGeneration = useRef(0);
  const notificationTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const dirty = JSON.stringify(song) !== baseline;
  const advice = advise(song);
  const warnings = advice.filter((a) => a.level === "warning");
  const update = <K extends keyof Song>(key: K, value: Song[K]) =>
    setSong((s) => ({ ...s, [key]: value }));
  const notify = (message: string) => {
    clearTimeout(notificationTimer.current);
    setToast(message);
    notificationTimer.current = setTimeout(() => setToast(""), 4500);
  };
  useEffect(() => {
    const generation = accountGeneration.current;
    api<{ user: User | null; usage: number; registration: boolean }>("/me")
      .then((data) => {
        if (generation !== accountGeneration.current) return;
        setUser(data.user);
        setUsage(data.usage);
        setRegistration(data.registration);
      })
      .catch((e) => {
        if (generation === accountGeneration.current)
          setError(`Cannot connect to the server: ${e.message}`);
      })
      .finally(() => setReady(true));
    return () => {
      clearTimeout(notificationTimer.current);
      clearTimeout(copyTimer.current);
    };
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem("sunomat-theme", dark ? "dark" : "light");
    } catch {}
  }, [dark]);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [dirty]);
  async function refreshLibrary() {
    if (!user) return;
    const request = ++libraryRequest.current;
    setLoading(true);
    try {
      const data = await api<{ projects: Saved[]; usage: number }>("/projects");
      if (request !== libraryRequest.current) return;
      setProjects(data.projects);
      setUsage(data.usage);
    } catch (e) {
      if (request === libraryRequest.current) setError((e as Error).message);
    } finally {
      if (request === libraryRequest.current) setLoading(false);
    }
  }
  useEffect(() => {
    if (user && view === "library") void refreshLibrary();
  }, [user, view]);
  function guard(action: () => void) {
    if (dirty) setPending(() => action);
    else action();
  }
  function signOut() {
    setAccountOpen(false);
    guard(() => {
      const generation = accountGeneration.current;
      void api("/logout", "POST", {})
        .then(() => {
          if (generation !== accountGeneration.current) return;
          clearAccount("Signed out. Private data cleared from this workspace.");
        })
        .catch((e) => {
          if (generation === accountGeneration.current) setError(e.message);
        });
    });
  }
  function clearAccount(message: string) {
    accountGeneration.current++;
    libraryRequest.current++;
    setAccountOpen(false);
    setLoading(false);
    setBusy(false);
    setUser(null);
    setProjects([]);
    setUsage(0);
    setSong(emptySong());
    setActive(null);
    setBaseId(undefined);
    setBaseline(JSON.stringify(emptySong()));
    setHistory(null);
    setHistoryName("");
    setComparison(null);
    setDeleteTarget(null);
    setPending(null);
    setQuery("");
    setFilter("all");
    setError("");
    notify(message);
  }
  function load(s: Saved, asTemplate = false, latestId?: string) {
    guard(() => {
      const next = asTemplate
        ? {
            ...s.song,
            title: "",
            kind: "song" as const,
            stage: "idea" as const,
            rating: 0,
            favorite: false,
            resultUrl: "",
            notes: "",
            changeNote: `Based on ${s.song.title || s.name}`,
          }
        : s.song;
      setSong(next);
      setActive(asTemplate ? null : s);
      setBaseId(asTemplate ? undefined : latestId || s.id);
      setBaseline(JSON.stringify(asTemplate ? emptySong() : next));
      setView("compose");
      setHistory(null);
      setStep("sound");
      setError("");
      notify(
        asTemplate
          ? "Template loaded as a new song. Original is unchanged."
          : "Saved version loaded.",
      );
    });
  }
  function newSong() {
    guard(() => {
      setSong(emptySong());
      setActive(null);
      setBaseId(undefined);
      setBaseline(JSON.stringify(emptySong()));
      setView("compose");
      setStep("sound");
      setError("");
    });
  }
  async function save() {
    if (!user) {
      setAuth(true);
      return;
    }
    const generation = accountGeneration.current;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ saved: Saved; usage: number }>(
        "/saves",
        "POST",
        { song, projectId: active?.projectId, baseId },
      );
      if (generation !== accountGeneration.current) return;
      setActive(result.saved);
      setBaseId(result.saved.id);
      setBaseline(JSON.stringify(song));
      setUsage(result.usage);
      notify("New version saved to your private library.");
    } catch (e) {
      if (generation === accountGeneration.current)
        setError((e as Error).message);
    } finally {
      if (generation === accountGeneration.current) setBusy(false);
    }
  }
  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(""), 1800);
    } catch {
      setError(
        "Clipboard access is unavailable. Select the text to copy it, or use Export.",
      );
    }
  }
  const copyButton = (label: string, value: string) => (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="copy-button"
      onClick={() => void copy(label, value)}
      aria-label={`Copy ${label}`}
    >
      {copied === label ? <Check size={13} /> : <Copy size={13} />}
      <span>{copied === label ? "Copied" : "Copy"}</span>
    </Button>
  );
  function toggleTag(tag: string) {
    const items = song.style
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const found = items.some((t) => t.toLowerCase() === tag.toLowerCase());
    const next = (
      found
        ? items.filter((t) => t.toLowerCase() !== tag.toLowerCase())
        : [...items, tag]
    ).join(", ");
    if (next.length > 1000) {
      notify("Style is full. Remove a tag before adding another.");
      return;
    }
    update("style", next);
  }
  function insertSection(tag: string) {
    const el = lyricsRef.current;
    const start = el?.selectionStart ?? song.lyrics.length;
    const end = el?.selectionEnd ?? start;
    const insert = `${start && song.lyrics[start - 1] !== "\n" ? "\n" : ""}[${tag}]\n`;
    const next = song.lyrics.slice(0, start) + insert + song.lyrics.slice(end);
    if (next.length > 5000) return;
    update("lyrics", next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + insert.length, start + insert.length);
    });
  }
  async function showHistory(project: Saved) {
    const request = ++libraryRequest.current;
    setLoading(true);
    try {
      const data = await api<{ versions: Saved[] }>(
        `/projects/${project.projectId}`,
      );
      if (request !== libraryRequest.current) return;
      setHistory(data.versions);
      setHistoryName(project.song.title || "Untitled idea");
    } catch (e) {
      if (request === libraryRequest.current) setError((e as Error).message);
    } finally {
      if (request === libraryRequest.current) setLoading(false);
    }
  }
  async function remove() {
    if (!deleteTarget) return;
    const generation = accountGeneration.current;
    setBusy(true);
    try {
      const r = await api<{ usage: number }>(
        `/${deleteTarget.type === "project" ? "projects" : "saves"}/${deleteTarget.id}`,
        "DELETE",
      );
      if (generation !== accountGeneration.current) return;
      setUsage(r.usage);
      if (
        active &&
        (deleteTarget.type === "project"
          ? active.projectId === deleteTarget.id
          : active.id === deleteTarget.id || baseId === deleteTarget.id)
      ) {
        setActive(null);
        setBaseId(undefined);
        setBaseline("");
      }
      setHistory(null);
      setDeleteTarget(null);
      void refreshLibrary();
      notify("Deleted. Storage space is available again.");
    } catch (e) {
      if (generation === accountGeneration.current)
        setError((e as Error).message);
    } finally {
      if (generation === accountGeneration.current) setBusy(false);
    }
  }
  async function importFile(file?: File) {
    if (!file) return;
    try {
      if (file.size > 80_000) throw new Error("Import file is too large.");
      let text: string;
      try {
        text = await file.text();
      } catch {
        throw new Error(
          "This file could not be read. Choose a local JSON setup and try again.",
        );
      }
      const parsed = parseSetup(text);
      guard(() => {
        setSong(parsed);
        setActive(null);
        setBaseId(undefined);
        setBaseline(JSON.stringify(emptySong()));
        setView("compose");
        notify("Setup imported. Save it to keep a private copy.");
      });
    } catch (e) {
      setError(`Import failed: ${(e as Error).message}`);
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  }
  function Field({
    id,
    label,
    hint,
    children,
    copyValue,
    count,
    max,
  }: {
    id: keyof Song;
    label: string;
    hint?: string;
    children: ReactNode;
    copyValue?: string;
    count?: number;
    max?: number;
  }) {
    // Defined below as a render helper (invoked directly) to retain input identity.
    return (
      <div className="field">
        <div className="field-label">
          <label htmlFor={id}>{label}</label>
          <div>
            {count !== undefined && (
              <span
                className={cn(
                  "counter",
                  count >= (max || Infinity) * 0.9 && "counter-warning",
                )}
              >
                {formatNumber(count)} /{" "}
                {max === undefined ? "" : formatNumber(max)}
              </span>
            )}
            {copyValue !== undefined && copyButton(label, copyValue)}
          </div>
        </div>
        {children}
        {hint && (
          <p className="field-hint" id={`${id}-hint`}>
            {hint}
          </p>
        )}
      </div>
    );
  }
  function textField(
    id: keyof Song,
    label: string,
    hint: string,
    placeholder: string,
    area = false,
    max = 1000,
  ) {
    const value = String(song[id]);
    return Field({
      id,
      label,
      hint,
      copyValue: value,
      count: area ? value.length : undefined,
      max,
      children: area ? (
        <Textarea
          id={id}
          aria-describedby={`${id}-hint`}
          value={value}
          maxLength={max}
          placeholder={placeholder}
          rows={id === "lyrics" ? 16 : 4}
          onChange={(e) => update(id, e.target.value as never)}
          ref={id === "lyrics" ? lyricsRef : undefined}
        />
      ) : (
        <Input
          id={id}
          aria-describedby={`${id}-hint`}
          value={value}
          maxLength={max}
          placeholder={placeholder}
          onChange={(e) => update(id, e.target.value as never)}
        />
      ),
    });
  }
  function selectField<K extends keyof Song>(
    id: K,
    label: string,
    options: [string, string][],
    hint?: string,
  ) {
    return Field({
      id,
      label,
      hint,
      copyValue: String(song[id]),
      children: (
        <select
          className="input"
          id={id}
          value={String(song[id])}
          onChange={(e) => update(id, e.target.value as Song[K])}
        >
          {options.map(([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ))}
        </select>
      ),
    });
  }
  function toggle(id: keyof Song, label: string, hint: string) {
    return (
      <div className="toggle-row">
        <div>
          <label htmlFor={id}>{label}</label>
          <p className="field-hint">{hint}</p>
        </div>
        <div className="toggle-actions">
          {copyButton(label, song[id] ? "On" : "Off")}
          <button
            id={id}
            className="switch"
            role="switch"
            aria-checked={Boolean(song[id])}
            aria-label={label}
            onClick={() => update(id, !song[id] as never)}
          >
            <span />
          </button>
        </div>
      </div>
    );
  }
  function slider(
    id: "weirdness" | "styleInfluence" | "variety" | "audioInfluence",
    label: string,
    hint: string,
    ends: [string, string],
  ) {
    return (
      <div className="slider-field">
        <div className="field-label">
          <label htmlFor={id}>{label}</label>
          <div>
            {copyButton(label, `${song[id]}%`)}
            <span className="slider-value">
              {song[id]}
              <small>%</small>
            </span>
          </div>
        </div>
        <p className="field-hint">{hint}</p>
        <input
          id={id}
          type="range"
          min="0"
          max="100"
          step="1"
          value={song[id]}
          onChange={(e) => update(id, Number(e.target.value))}
        />
        <div className="slider-ends">
          <span>{ends[0]}</span>
          <span>{ends[1]}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setView("compose");
          }}
          aria-label="Sunomat home"
        >
          <span className="brand-mark">
            <AudioLines size={23} />
          </span>
          <span>
            sunomat<span className="brand-dot">.</span>
          </span>
        </a>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav aria-label="Main navigation">
          <button
            className={cn("nav-item", view === "compose" && "active")}
            onClick={() => setView("compose")}
          >
            <SlidersHorizontal size={18} />
            Composer
            <ChevronRight className="nav-arrow" size={14} />
          </button>
          <button
            className={cn("nav-item", view === "library" && "active")}
            onClick={() => setView("library")}
          >
            <FolderOpen size={18} />
            My library
            {user && <span className="nav-count">{projects.length || ""}</span>}
          </button>
          <button
            className={cn("nav-item", view === "guide" && "active")}
            onClick={() => setView("guide")}
          >
            <Bookmark size={18} />
            Field guide
            <ArrowUpRight className="nav-arrow" size={14} />
          </button>
        </nav>
        <div className="sidebar-divider" />
        <button className="new-project" onClick={newSong}>
          <Plus size={16} />
          New song
        </button>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="small-icon">
              <AudioLines size={20} />
            </span>
            <strong>
              Your sound.
              <br />
              Worth remembering.
            </strong>
            <p>
              Keep the settings behind
              <br />
              your best songs.
            </p>
            <div className="tiny-wave" aria-hidden="true">
              {[8, 17, 11, 25, 17, 31, 20, 13, 23, 12, 18, 7].map((h, i) => (
                <i key={i} style={{ height: h }} />
              ))}
            </div>
          </div>
          <div className="storage">
            <div>
              <span>{user ? "Saved versions" : "Guest workspace"}</span>
              <span>{user ? `${usage} / 100` : "No account needed"}</span>
            </div>
            <progress
              value={usage}
              max={100}
              aria-label="Saved versions used"
            />
            <p>
              {user
                ? "Private to your account."
                : "Sign in to keep your best work."}
            </p>
          </div>
          <button
            className="account"
            disabled={!ready}
            onClick={() => {
              if (user) signOut();
              else setAuth(true);
            }}
          >
            <span className="avatar">
              <UserRound size={17} />
            </span>
            <span>
              <strong>
                {user ? user.email.split("@")[0] : "Make it yours"}
              </strong>
              <small>
                {user ? "Sign out" : "Sign in or create an account"}
              </small>
            </span>
            {user ? <LogOut size={15} /> : <ArrowUpRight size={15} />}
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace
            <ChevronRight size={13} />
            <strong>
              {view === "compose"
                ? "Composer"
                : view === "library"
                  ? "My library"
                  : "Field guide"}
            </strong>
          </div>
          <div className="topbar-actions">
            <Badge className="version-badge">
              <span />
              Suno v6 ready
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setDark(!dark)}
              aria-label={`Switch to ${dark ? "light" : "dark"} mode`}
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </Button>
            <span className="topbar-divider" />
            <Button
              variant="outline"
              size="sm"
              disabled={!ready}
              onClick={() => (user ? setAccountOpen(true) : setAuth(true))}
            >
              <UserRound size={14} />
              {user ? "My account" : "Sign in"}
            </Button>
          </div>
        </header>
        <main>
          {error && (
            <div className="error-banner" role="alert">
              <Info size={17} />
              <span>{error}</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setError("")}
                aria-label="Dismiss error"
              >
                <X size={16} />
              </Button>
            </div>
          )}
          {view === "compose" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    <span />
                    THE SONG WORKSPACE
                  </div>
                  <h1>
                    Good songs start here<span>.</span>
                  </h1>
                  <p>
                    Shape your sound. Find what works. Keep it for the next one.
                  </p>
                </div>
                <div className="heading-actions">
                  <Button
                    variant="outline"
                    onClick={() => setHandoffOpen(true)}
                  >
                    <ArrowUpRight size={15} />
                    Suno handoff
                  </Button>
                  <Button
                    onClick={() => void save()}
                    disabled={busy || !ready || Boolean(user && usage >= 100)}
                  >
                    <Save size={15} />
                    {busy ? "Saving…" : user ? "Save version" : "Save song"}
                  </Button>
                </div>
              </div>
              <div className="composer-status">
                <div className="status-name">
                  <span className={cn("status-dot", dirty && "unsaved")} />
                  <span>
                    {active
                      ? active.song.title || "Untitled idea"
                      : "Untitled workspace"}
                  </span>
                  <span className="status-separator">/</span>
                  <span className="muted">
                    {dirty
                      ? "Unsaved changes"
                      : active
                        ? "All changes saved"
                        : "Make something new"}
                  </span>
                </div>
                <button
                  className="text-action"
                  onClick={() =>
                    update(
                      "kind",
                      song.kind === "template" ? "song" : "template",
                    )
                  }
                >
                  <Bookmark size={13} />
                  {song.kind === "template" ? "Template setup" : "Song setup"}
                  <ChevronDown size={12} />
                </button>
              </div>
              <div className="composer-layout">
                <div className="editor-column">
                  <div
                    className="step-tabs"
                    role="tablist"
                    aria-label="Composer sections"
                  >
                    {stepList.map((s, i) => (
                      <button
                        key={s.id}
                        id={`tab-${s.id}`}
                        role="tab"
                        aria-selected={step === s.id}
                        aria-controls={`panel-${s.id}`}
                        tabIndex={step === s.id ? 0 : -1}
                        onKeyDown={(e) => {
                          if (
                            ["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                              e.key,
                            )
                          ) {
                            e.preventDefault();
                            const next =
                              e.key === "Home"
                                ? 0
                                : e.key === "End"
                                  ? 3
                                  : (i + (e.key === "ArrowRight" ? 1 : 3)) % 4;
                            setStep(stepList[next].id);
                            document
                              .getElementById(`tab-${stepList[next].id}`)
                              ?.focus();
                          }
                        }}
                        onClick={() => setStep(s.id)}
                        className={cn("step-tab", step === s.id && "selected")}
                      >
                        <span className="step-number">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span>{s.name}</span>
                      </button>
                    ))}
                  </div>
                  <div
                    role="tabpanel"
                    id={`panel-${step}`}
                    aria-labelledby={`tab-${step}`}
                  >
                    {step === "sound" && (
                      <>
                        <Card>
                          <div className="section-heading">
                            <div>
                              <h2>
                                <AudioLines size={18} />
                                Find your sound
                              </h2>
                              <p>A clear direction makes all the difference.</p>
                            </div>
                            <Badge>01 / 04</Badge>
                          </div>
                          <div className="form-grid">
                            {textField(
                              "title",
                              "Song title",
                              "A working title now. A unique project name when you save.",
                              "e.g. The space between",
                              false,
                              120,
                            )}
                            {selectField(
                              "model",
                              "Suno model",
                              [
                                ["v6", "v6 · balanced & precise"],
                                ["v6-wild", "v6-wild · explore"],
                                ["v6-mini", "v6-mini · quick ideas"],
                                ["custom", "Custom model"],
                              ],
                              "v6 and v6-wild require Pro or Premier in Suno.",
                            )}
                          </div>
                          {song.model === "custom" &&
                            textField(
                              "customModel",
                              "Custom model name",
                              "Select this model manually in Suno.",
                              "e.g. My acoustic model",
                              false,
                              200,
                            )}
                          <div className="mode-row">
                            <span>Creation mode</span>
                            <div className="segmented">
                              {(["custom", "simple"] as const).map((m) => (
                                <button
                                  key={m}
                                  onClick={() => update("mode", m)}
                                  aria-pressed={song.mode === m}
                                  className={song.mode === m ? "selected" : ""}
                                >
                                  {m === "custom" ? "Custom" : "Simple"}
                                </button>
                              ))}
                            </div>
                          </div>
                          {song.mode === "custom" ? (
                            <>
                              {textField(
                                "style",
                                "Style of music",
                                "Genre → tempo → mood → instruments → vocals → production. Keep it specific.",
                                "e.g. indie folk, 92 BPM, warm, fingerpicked guitar, soft vocals, intimate dry mix",
                                true,
                                1000,
                              )}
                              <div className="tag-builder">
                                <div className="tag-header">
                                  <span>
                                    <WandSparkles size={14} />
                                    Build with tags
                                  </span>
                                  <span>Click to add or remove</span>
                                </div>
                                <div
                                  className="tag-categories"
                                  aria-label="Tag category"
                                >
                                  {Object.keys(tagGroups).map((g) => (
                                    <button
                                      key={g}
                                      onClick={() => {
                                        setGroup(g);
                                        setTagQuery("");
                                      }}
                                      aria-pressed={group === g}
                                      className={group === g ? "selected" : ""}
                                    >
                                      {g}
                                    </button>
                                  ))}
                                </div>
                                <div className="tag-search">
                                  <Search size={13} />
                                  <input
                                    aria-label="Search style tags"
                                    value={tagQuery}
                                    onChange={(e) =>
                                      setTagQuery(e.target.value)
                                    }
                                    placeholder={`Search ${group.toLowerCase()}…`}
                                  />
                                </div>
                                <div className="tags">
                                  {(tagQuery
                                    ? Object.values(tagGroups).flat()
                                    : tagGroups[group]
                                  )
                                    .filter((t) =>
                                      t
                                        .toLowerCase()
                                        .includes(tagQuery.toLowerCase()),
                                    )
                                    .map((tag) => (
                                      <button
                                        key={tag}
                                        aria-pressed={song.style
                                          .split(",")
                                          .some(
                                            (t) =>
                                              t.trim().toLowerCase() ===
                                              tag.toLowerCase(),
                                          )}
                                        className={cn(
                                          "tag",
                                          song.style
                                            .split(",")
                                            .some(
                                              (t) =>
                                                t.trim().toLowerCase() ===
                                                tag.toLowerCase(),
                                            ) && "selected",
                                        )}
                                        onClick={() => toggleTag(tag)}
                                      >
                                        {song.style
                                          .split(",")
                                          .some(
                                            (t) =>
                                              t.trim().toLowerCase() ===
                                              tag.toLowerCase(),
                                          ) ? (
                                          <Check size={11} />
                                        ) : (
                                          <Plus size={11} />
                                        )}{" "}
                                        {tag}
                                      </button>
                                    ))}
                                </div>
                              </div>
                              {textField(
                                "exclude",
                                "Exclude styles",
                                "Name unwanted elements here, rather than using “no” in Style.",
                                "e.g. distorted guitars, autotune, choir",
                                false,
                                1000,
                              )}
                            </>
                          ) : (
                            textField(
                              "prompt",
                              "Simple prompt",
                              "Describe the whole idea. Suno interprets the sound, words and arrangement. Custom fields are retained if you switch back.",
                              "e.g. A hopeful piano-led song about taking the last train home, with a quiet verse that opens into a bright chorus.",
                              true,
                              5000,
                            )
                          )}
                        </Card>
                        <Card className="preset-card">
                          <div className="section-heading">
                            <div>
                              <h2>
                                <Sparkles size={16} />A little inspiration
                              </h2>
                              <p>Start with a direction, then make it yours.</p>
                            </div>
                            <span className="subtle-label">STARTER SETUPS</span>
                          </div>
                          <div className="presets">
                            {presets.map((p, i) => (
                              <button
                                className="preset"
                                key={p.name}
                                onClick={() =>
                                  guard(() => {
                                    setSong({
                                      ...emptySong(),
                                      ...p.song,
                                      title: song.title,
                                    });
                                    setActive(null);
                                    setBaseId(undefined);
                                    setBaseline(JSON.stringify(emptySong()));
                                    notify("Starter loaded. Make it your own.");
                                  })
                                }
                              >
                                <span className="preset-art" aria-hidden="true">
                                  {[11, 24, 17, 33, 21, 29, 14].map((h, j) => (
                                    <i
                                      key={j}
                                      style={{ height: h + ((i - j) % 3) }}
                                    />
                                  ))}
                                </span>
                                <strong>{p.name}</strong>
                                <small>{p.description}</small>
                                <ArrowUpRight size={14} />
                              </button>
                            ))}
                          </div>
                        </Card>
                      </>
                    )}
                    {step === "lyrics" && (
                      <Card>
                        <div className="section-heading">
                          <div>
                            <h2>
                              <FileText size={18} />
                              Give it a story
                            </h2>
                            <p>
                              Words to sing. Brackets to guide the performance.
                            </p>
                          </div>
                          <Badge>02 / 04</Badge>
                        </div>
                        {song.mode === "simple" ? (
                          <div className="inline-note">
                            <Info size={17} />
                            Simple mode uses your complete prompt. Switch to
                            Custom on Sound & style to use separate lyrics.
                          </div>
                        ) : (
                          <>
                            {toggle(
                              "instrumental",
                              "Instrumental",
                              "Keep this song free of sung lyrics. Existing lyrics remain in your draft.",
                            )}
                            <div className="lyrics-toolbar">
                              {sectionTags.map((t) => (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  key={t}
                                  onClick={() => insertSection(t)}
                                >
                                  <Plus size={11} />
                                  {t}
                                </Button>
                              ))}
                            </div>
                            {textField(
                              "lyrics",
                              "Lyrics",
                              "Use your own lyrics. Put short performance cues inside [Section | direction]. Round brackets are for sung ad-libs.",
                              "[Verse 1 | soft, close-mic]\nThe porch light draws a golden line\nI leave the rush of town behind\n\n[Chorus | open voice, harmonies]\nThere is room for us to grow\nWhere the quiet rivers go",
                              true,
                              5000,
                            )}
                            <div className="form-grid">
                              {textField(
                                "language",
                                "Lyric language",
                                "Planning note; write lyrics in the intended language.",
                                "English, German…",
                                false,
                                100,
                              )}
                              {selectField(
                                "vocalGender",
                                "Vocal gender",
                                [
                                  ["unspecified", "No preference"],
                                  ["female", "Female"],
                                  ["male", "Male"],
                                ],
                                "A direction in Suno, not a guaranteed result.",
                              )}
                            </div>
                            <div className="inline-note">
                              <Lightbulb size={17} />
                              <p>
                                Keep lines similar in length. Reuse the same
                                chorus words for a stronger hook. Tags guide the
                                model; they are not exact commands.
                              </p>
                            </div>
                          </>
                        )}
                      </Card>
                    )}
                    {step === "controls" && (
                      <Card>
                        <div className="section-heading">
                          <div>
                            <h2>
                              <Settings2 size={18} />
                              Make it intentional
                            </h2>
                            <p>
                              Record the exact controls you will use in Suno.
                            </p>
                          </div>
                          <Badge>03 / 04</Badge>
                        </div>
                        {song.mode === "simple" && (
                          <div className="inline-note">
                            <Info size={17} />
                            These Custom-mode settings are retained for later.
                            They are omitted from the Simple-mode handoff.
                          </div>
                        )}
                        {slider(
                          "weirdness",
                          "Weirdness",
                          "50% is Suno’s normal expected result. Lower values favor familiar choices.",
                          ["Safe", "Chaos"],
                        )}
                        {slider(
                          "styleInfluence",
                          "Style influence",
                          "How closely the result follows your style description.",
                          ["Loose", "Strong"],
                        )}
                        {slider(
                          "variety",
                          "Variety",
                          "Set to 0 for controlled tests. Higher values can adjust your style prompt.",
                          ["Exact prompt", "More variety"],
                        )}
                        {toggle(
                          "maxMode",
                          "Max Mode",
                          "Consider for long tracks, close covers and consistent voice or style. Costs more credits in Suno.",
                        )}
                        {toggle(
                          "hasAudio",
                          "Audio reference",
                          "Record an audio source you will attach directly in Suno.",
                        )}
                        {song.hasAudio &&
                          slider(
                            "audioInfluence",
                            "Audio influence",
                            "Only applies when audio is attached in Suno.",
                            ["Subtle reference", "Close to source"],
                          )}
                        {textField(
                          "referenceNotes",
                          "Reference notes",
                          "Record source names or URLs and what each should contribute. Text only; attach audio, images or videos in Suno.",
                          "e.g. My guitar demo — keep the verse rhythm; rooftop photo — capture the quiet mood.",
                          true,
                          2000,
                        )}
                        <details className="advanced-details">
                          <summary>
                            Personalization & planning
                            <ChevronDown size={15} />
                          </summary>
                          <div className="form-grid">
                            {textField(
                              "persona",
                              "Persona",
                              "Record the selected persona. Check its privacy setting in Suno.",
                              "Persona name or link",
                              false,
                              300,
                            )}
                            {textField(
                              "voice",
                              "Voice",
                              "Record the selected voice. Availability depends on your Suno plan and model.",
                              "Voice name",
                              false,
                              300,
                            )}
                          </div>
                          {toggle(
                            "myTaste",
                            "My Taste",
                            "Record whether personalization was enabled in Suno. It can affect repeatability.",
                          )}
                          <div className="form-grid">
                            {Field({
                              id: "duration",
                              label: "Target duration (minutes)",
                              hint: "Planning only. Suno supports up to 8 minutes; exact duration is not guaranteed.",
                              copyValue: String(song.duration),
                              children: (
                                <Input
                                  id="duration"
                                  type="number"
                                  min="0.25"
                                  max="8"
                                  step="0.25"
                                  value={song.duration}
                                  onChange={(e) =>
                                    update("duration", Number(e.target.value))
                                  }
                                />
                              ),
                            })}
                            {Field({
                              id: "bpm",
                              label: "Tempo (BPM)",
                              hint: "Planning only. Add BPM to Style to include it in the sound prompt.",
                              copyValue: String(song.bpm),
                              children: (
                                <Input
                                  id="bpm"
                                  type="number"
                                  min="20"
                                  max="300"
                                  value={song.bpm}
                                  onChange={(e) =>
                                    update("bpm", Number(e.target.value))
                                  }
                                />
                              ),
                            })}
                          </div>
                          {textField(
                            "musicalKey",
                            "Key / time signature",
                            "Optional planning note. Include it in Style if it matters to this track.",
                            "e.g. D minor, 6/8",
                            false,
                            100,
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const additions = [
                                `${song.bpm} BPM`,
                                song.musicalKey,
                              ].filter(Boolean);
                              const parts = song.style
                                .split(",")
                                .map((t) => t.trim())
                                .filter(Boolean);
                              const retained = parts.filter(
                                (t) => !/^\d+\s*BPM$/i.test(t),
                              );
                              const result = Array.from(
                                new Set([...retained, ...additions]),
                              ).join(", ");
                              if (result.length <= 1000)
                                update("style", result);
                              else notify("Not enough room in Style.");
                            }}
                          >
                            <Plus size={13} />
                            Add tempo & key to Style
                          </Button>
                        </details>
                      </Card>
                    )}
                    {step === "production" && (
                      <Card>
                        <div className="section-heading">
                          <div>
                            <h2>
                              <Layers3 size={18} />
                              Make the next take better
                            </h2>
                            <p>Keep the decisions behind the sound you love.</p>
                          </div>
                          <Badge>04 / 04</Badge>
                        </div>
                        <div className="form-grid">
                          {selectField("stage", "Production stage", [
                            ["idea", "Idea"],
                            ["draft", "Draft"],
                            ["testing", "Testing"],
                            ["finished", "Finished"],
                          ])}
                          {selectField(
                            "kind",
                            "Save as",
                            [
                              ["song", "Song project"],
                              ["template", "Reusable template"],
                            ],
                            "Templates use the same private, versioned storage.",
                          )}
                        </div>
                        {textField(
                          "changeNote",
                          "Change for this take",
                          "Change one thing per test so you can hear what helped. This note belongs to the next saved version.",
                          "e.g. Reduce Weirdness from 50 to 35; keep all other settings.",
                          true,
                          500,
                        )}
                        {textField(
                          "notes",
                          "Listening & production notes",
                          "Listen to both Suno outputs. Record what worked, what drifted and what to try next.",
                          "Take A: great verse texture. Take B: stronger chorus. Next: soften the drums.",
                          true,
                          5000,
                        )}
                        {textField(
                          "resultUrl",
                          "Result URL",
                          "Link the Suno result that goes with this saved setup.",
                          "https://suno.com/song/…",
                          false,
                          2000,
                        )}
                        <div className="rating-row">
                          <div>
                            <label>How did it turn out?</label>
                            <p className="field-hint">
                              Rate the result, not just the idea.
                            </p>
                          </div>
                          <div
                            className="stars"
                            role="group"
                            aria-label="Result rating"
                          >
                            {[1, 2, 3, 4, 5].map((n) => (
                              <button
                                key={n}
                                aria-label={`Rate ${n} stars`}
                                aria-pressed={song.rating === n}
                                onClick={() =>
                                  update("rating", song.rating === n ? 0 : n)
                                }
                              >
                                <Star
                                  size={22}
                                  fill={
                                    song.rating >= n ? "currentColor" : "none"
                                  }
                                />
                              </button>
                            ))}
                            {copyButton("Rating", `${song.rating}/5`)}
                          </div>
                        </div>
                        {toggle(
                          "favorite",
                          "Favorite setup",
                          "Keep proven settings easy to find in your library.",
                        )}
                        <div className="inline-note">
                          <ShieldCheck size={18} />
                          <p>
                            Each save creates a new version. Older versions stay
                            unchanged. Your account can hold{" "}
                            <strong>100 saved versions</strong> across all songs
                            and templates.
                          </p>
                        </div>
                      </Card>
                    )}
                  </div>
                  <div className="editor-footer">
                    <span>
                      <ShieldCheck size={13} />
                      {user
                        ? "Only you can access your saved setups."
                        : "Free to compose. Sign in to save."}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const i = stepList.findIndex((s) => s.id === step);
                        if (i < 3) setStep(stepList[i + 1].id);
                        else setHandoffOpen(true);
                      }}
                    >
                      {step === "production"
                        ? "Review handoff"
                        : "Next section"}
                      <ArrowRight size={14} />
                    </Button>
                  </div>
                </div>
                <aside className="insight-column">
                  <Card className="preview-card">
                    <div className="preview-heading">
                      <span className="eyebrow">YOUR SONG, AT A GLANCE</span>
                      <span className="live-label">
                        <span />
                        LIVE
                      </span>
                    </div>
                    <div className="record-art" aria-hidden="true">
                      <div className="record">
                        <div className="record-center">
                          <AudioLines size={24} />
                        </div>
                      </div>
                      <span className="record-label">SM — 001</span>
                      <span className="record-caption">A WORK IN PROGRESS</span>
                    </div>
                    <div className="preview-title">
                      <h3>{song.title || "Your next great song"}</h3>
                      <p>
                        {song.style.split(",").slice(0, 2).join(" · ") ||
                          "A sound waiting to happen"}
                      </p>
                    </div>
                    <div className="preview-meta">
                      <span>
                        <Music2 size={12} />
                        {song.model}
                      </span>
                      <span>
                        {song.instrumental
                          ? "Instrumental"
                          : song.vocalGender === "unspecified"
                            ? "Vocals"
                            : `${song.vocalGender} vocals`}
                      </span>
                      <span className="stage-label">{song.stage}</span>
                    </div>
                    <div className="preview-divider" />
                    <div className="preview-text">
                      <span>
                        {song.mode === "simple"
                          ? "PROMPT PREVIEW"
                          : "STYLE PREVIEW"}
                      </span>
                      <p>
                        {(song.mode === "simple" ? song.prompt : song.style) ||
                          "Your style will take shape here. Start with a genre or explore the tags."}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      className="full-width"
                      onClick={() =>
                        void copy(
                          "Style prompt",
                          song.mode === "simple" ? song.prompt : song.style,
                        )
                      }
                    >
                      {copied === "Style prompt" ? (
                        <Check size={14} />
                      ) : (
                        <Copy size={14} />
                      )}
                      Copy {song.mode === "simple" ? "prompt" : "style prompt"}
                    </Button>
                  </Card>
                  <Card className="coach-card">
                    <div className="coach-title">
                      <span className="coach-icon">
                        <Sparkles size={16} />
                      </span>
                      <div>
                        <h3>A second pair of ears</h3>
                        <p>Guidance as you write</p>
                      </div>
                      {warnings.length > 0 && <Badge>{warnings.length}</Badge>}
                    </div>
                    <div className="coach-filter">
                      <label htmlFor="advice-filter">Review</label>
                      <select
                        id="advice-filter"
                        value={adviceField}
                        onChange={(e) => setAdviceField(e.target.value)}
                      >
                        <option value="all">All fields</option>
                        {[...new Set(advice.map((a) => a.field))].map((f) => (
                          <option key={f} value={f}>
                            {fieldLabels[f]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="advice-list">
                      {advice
                        .filter(
                          (a) =>
                            adviceField === "all" || a.field === adviceField,
                        )
                        .slice(0, 4)
                        .map((a, i) => (
                          <AdviceItem
                            key={`${a.field}-${a.title}`}
                            advice={a}
                            number={i + 1}
                          />
                        ))}
                      {advice.length === 0 && (
                        <p className="muted">
                          Your setup is clear. Test it in Suno and record what
                          you hear.
                        </p>
                      )}
                    </div>
                    <button
                      className="coach-link"
                      onClick={() => setView("guide")}
                    >
                      Explore the field guide
                      <ArrowUpRight size={13} />
                    </button>
                    <p className="coach-disclaimer">
                      Rule-based suggestions, not a quality score.
                      <br />
                      Great music still starts with your ears.
                    </p>
                  </Card>
                  <div className="export-tools">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        download(
                          `${song.title || "sunomat"}-setup.json`,
                          JSON.stringify(
                            { format: "sunomat-v1", song },
                            null,
                            2,
                          ),
                          "application/json",
                        )
                      }
                    >
                      <ArrowDownToLine size={14} />
                      Export JSON
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => importRef.current?.click()}
                    >
                      <Upload size={14} />
                      Import setup
                    </Button>
                  </div>
                  <input
                    ref={importRef}
                    type="file"
                    accept=".json,application/json"
                    className="sr-only"
                    aria-label="Import JSON setup"
                    onChange={(e) => void importFile(e.target.files?.[0])}
                  />
                </aside>
              </div>
            </>
          )}
          {view === "library" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    <span />
                    THE GOOD STUFF, KEPT
                  </div>
                  <h1>
                    Your sound library<span>.</span>
                  </h1>
                  <p>
                    Proven settings. Work in progress. Every version that got
                    you here.
                  </p>
                </div>
                <Button onClick={newSong}>
                  <Plus size={15} />
                  New song
                </Button>
              </div>
              {!user ? (
                <Card className="empty-state">
                  <span className="empty-icon">
                    <FolderOpen size={32} />
                  </span>
                  <h2>Your best settings deserve a home.</h2>
                  <p>
                    Sign in to save projects, revisit earlier versions and turn
                    a great result into your next template. Your library is
                    private.
                  </p>
                  <Button onClick={() => setAuth(true)}>
                    <UserRound size={15} />
                    Sign in to your library
                  </Button>
                  <Button variant="ghost" onClick={() => setView("compose")}>
                    Keep composing as a guest
                    <ArrowRight size={14} />
                  </Button>
                </Card>
              ) : (
                <>
                  <LibraryTransfer
                    key={user.id}
                    usage={usage}
                    onNotice={notify}
                    onImported={(result) => {
                      setUsage(result.usage);
                      void refreshLibrary();
                    }}
                  />
                  <div className="library-toolbar">
                    <div className="search-box">
                      <Search size={16} />
                      <Input
                        aria-label="Search saved projects"
                        placeholder="Search titles, styles, notes…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </div>
                    <select
                      className="input library-filter"
                      aria-label="Filter saved projects"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    >
                      <option value="all">All projects</option>
                      <option value="template">Templates</option>
                      <option value="favorite">Favorites</option>
                      <option value="finished">Finished</option>
                      <option value="testing">Testing</option>
                    </select>
                    <Badge>{usage} / 100 versions</Badge>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="Refresh library"
                      onClick={() => void refreshLibrary()}
                      disabled={loading}
                    >
                      <RotateCcw size={15} />
                    </Button>
                  </div>
                  {usage >= 90 && (
                    <div className="inline-note">
                      <Info size={18} />
                      You have {100 - usage} saved versions left. Delete older
                      versions or projects to free space.
                    </div>
                  )}
                  {loading ? (
                    <p className="loading" role="status">
                      Loading your library…
                    </p>
                  ) : projects.length === 0 ? (
                    <Card className="empty-state">
                      <Music2 size={32} />
                      <h2>The first song is yours to make.</h2>
                      <p>
                        Save any draft from the composer to start your library.
                      </p>
                      <Button onClick={() => setView("compose")}>
                        Open composer
                        <ArrowRight size={14} />
                      </Button>
                    </Card>
                  ) : (
                    <div className="library-grid">
                      {projects
                        .filter(
                          (p) =>
                            (filter === "all" ||
                              (filter === "favorite" && p.song.favorite) ||
                              p.song.kind === filter ||
                              p.song.stage === filter) &&
                            `${p.song.title} ${p.song.style} ${p.song.notes} ${p.name}`
                              .toLowerCase()
                              .includes(query.toLowerCase()),
                        )
                        .map((p) => (
                          <Card className="project-card" key={p.projectId}>
                            <div className="project-top">
                              <span className="project-icon">
                                {p.song.kind === "template" ? (
                                  <Bookmark size={22} />
                                ) : (
                                  <AudioLines size={22} />
                                )}
                              </span>
                              <div>
                                <Badge>
                                  {p.song.kind === "template"
                                    ? "Template"
                                    : p.song.stage}
                                </Badge>
                                {p.song.favorite && (
                                  <Star size={15} fill="currentColor" />
                                )}
                              </div>
                            </div>
                            <h2>{p.song.title || "Untitled idea"}</h2>
                            <p className="project-style">
                              {p.song.style ||
                                p.song.prompt ||
                                "A work in progress."}
                            </p>
                            <div className="project-info">
                              <span>{p.song.model}</span>
                              <span>
                                {p.versions}{" "}
                                {p.versions === 1 ? "version" : "versions"}
                              </span>
                              <span>
                                {p.song.rating > 0
                                  ? `${"★".repeat(p.song.rating)}`
                                  : "Unrated"}
                              </span>
                            </div>
                            <p className="project-date">{date(p.createdAt)}</p>
                            <div className="project-actions">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => load(p)}
                              >
                                Open
                                <ArrowRight size={13} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => load(p, true)}
                              >
                                Use as template
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Version history for ${p.song.title}`}
                                onClick={() => void showHistory(p)}
                              >
                                <History size={16} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Delete ${p.song.title || "untitled project"}`}
                                onClick={() =>
                                  setDeleteTarget({
                                    id: p.projectId,
                                    type: "project",
                                  })
                                }
                              >
                                <Trash2 size={15} />
                              </Button>
                            </div>
                          </Card>
                        ))}
                    </div>
                  )}
                  {projects.length > 0 &&
                    !projects.some(
                      (p) =>
                        (filter === "all" ||
                          (filter === "favorite" && p.song.favorite) ||
                          p.song.kind === filter ||
                          p.song.stage === filter) &&
                        `${p.song.title} ${p.song.style} ${p.song.notes} ${p.name}`
                          .toLowerCase()
                          .includes(query.toLowerCase()),
                    ) && (
                      <p className="empty-results">
                        No projects match. Try another search or filter.
                      </p>
                    )}
                </>
              )}
            </>
          )}
          {view === "guide" && (
            <Guide onBack={() => setView("compose")} advice={advice} />
          )}
          <footer className="page-footer">
            <span>
              sunomat<span className="muted"> / </span>Made for a more
              intentional sound.
            </span>
            <span>Independent workspace · Not affiliated with Suno</span>
          </footer>
        </main>
      </div>
      <AccountSettings
        key={user?.id || "guest"}
        user={user}
        usage={usage}
        open={accountOpen}
        onOpenChange={setAccountOpen}
        onOpenLibrary={() => {
          setView("library");
          setAccountOpen(false);
        }}
        onSignOut={signOut}
        onPasswordChanged={() =>
          notify("Password updated. Other sessions have been signed out.")
        }
        onDeleted={() => {
          clearAccount(
            "Account deleted. Your private library and sessions have been removed.",
          );
          setView("compose");
        }}
      />
      <Dialog
        open={auth}
        onOpenChange={setAuth}
        title={authMode === "login" ? "Welcome back." : "Keep your best work."}
        description={
          authMode === "login"
            ? "Sign in to your private song workspace."
            : "Create an account for private projects, templates and version history."
        }
      >
        <AuthForm
          mode={authMode}
          registration={registration}
          onMode={setAuthMode}
          onSuccess={(u) => {
            const generation = ++accountGeneration.current;
            libraryRequest.current++;
            setProjects([]);
            setLoading(false);
            setBusy(false);
            setUser(u);
            setAuth(false);
            void api<{ usage: number }>("/me")
              .then((r) => {
                if (generation === accountGeneration.current) setUsage(r.usage);
              })
              .catch((e) => {
                if (generation === accountGeneration.current)
                  setError(e.message);
              });
            notify("Signed in. Your current draft is ready to save.");
          }}
        />
      </Dialog>
      <Dialog
        open={Boolean(pending)}
        onOpenChange={(v) => {
          if (!v) setPending(null);
        }}
        title="Keep this draft?"
        description="You have unsaved changes. Export your setup or save a version before replacing it."
      >
        <div className="dialog-actions">
          <Button
            variant="outline"
            onClick={() => {
              download(
                "sunomat-draft.json",
                JSON.stringify({ song }, null, 2),
                "application/json",
              );
            }}
          >
            Export draft
          </Button>
          <Button variant="outline" onClick={() => setPending(null)}>
            Keep editing
          </Button>
          <Button
            onClick={() => {
              pending?.();
              setPending(null);
            }}
          >
            Discard changes
          </Button>
        </div>
      </Dialog>
      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(v) => {
          if (!v) setDeleteTarget(null);
        }}
        title={
          deleteTarget?.type === "project"
            ? "Delete this project?"
            : "Delete this saved version?"
        }
        description={
          deleteTarget?.type === "project"
            ? "This permanently removes the project and all its versions from your private library. Export anything you want to keep first."
            : "This permanently removes this snapshot. Other saved versions remain available."
        }
      >
        <div className="dialog-actions">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() => void remove()}
          >
            {busy ? "Deleting…" : "Delete permanently"}
          </Button>
        </div>
      </Dialog>
      <Dialog
        open={Boolean(history)}
        onOpenChange={(v) => {
          if (!v) setHistory(null);
        }}
        title="Every step, remembered."
        description={`Version history for ${historyName}. Opening an earlier version does not change it. Saving creates a new latest version.`}
      >
        <div className="history-list">
          {history?.map((s, i) => (
            <article key={s.id}>
              <div>
                <strong>{date(s.createdAt)}</strong>
                {i === 0 && <Badge>Latest</Badge>}
                <p>{s.song.changeNote || "No change note recorded."}</p>
                <small>
                  {s.song.model} · {s.song.stage} · {s.song.rating}/5
                </small>
              </div>
              <div className="history-actions">
                {i > 0 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Compare with latest version"
                    onClick={() =>
                      setComparison({ before: s, after: history[0] })
                    }
                  >
                    <GitCompareArrows size={16} />
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => load(s, false, history[0].id)}
                >
                  Open
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Export this version"
                  onClick={() =>
                    download(
                      `${s.name}-${s.id}.json`,
                      JSON.stringify({ song: s.song }, null, 2),
                      "application/json",
                    )
                  }
                >
                  <ArrowDownToLine size={15} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Delete this version"
                  onClick={() => setDeleteTarget({ id: s.id, type: "version" })}
                >
                  <Trash2 size={15} />
                </Button>
              </div>
            </article>
          ))}
        </div>
      </Dialog>
      <VersionComparison
        versions={comparison}
        onClose={() => setComparison(null)}
      />
      <Dialog
        open={handoffOpen}
        onOpenChange={setHandoffOpen}
        title="Ready for Suno."
        description="Copy each field into Suno, then set the controls manually. Planning notes do not change Suno settings automatically."
      >
        <div className="handoff-fields">
          {(song.mode === "simple"
            ? [
                ["Title", song.title],
                ["Prompt", song.prompt],
              ]
            : [
                ["Title", song.title],
                ["Style", song.style],
                ["Exclude", song.exclude],
                ["Lyrics", song.instrumental ? "" : song.lyrics],
              ]
          ).map(([label, value]) => (
            <div key={label}>
              <div className="field-label">
                <strong>{label}</strong>
                {copyButton(label, value)}
              </div>
              <pre>{value || "(empty)"}</pre>
            </div>
          ))}
          <details>
            <summary>Controls & planning checklist</summary>
            <pre>{handoff(song)}</pre>
          </details>
        </div>
        <div className="dialog-actions">
          <Button
            variant="outline"
            onClick={() =>
              download(`${song.title || "song"}-suno.txt`, handoff(song))
            }
          >
            <ArrowDownToLine size={14} />
            Export text
          </Button>
          <Button onClick={() => void copy("Full setup", handoff(song))}>
            <Copy size={14} />
            {copied === "Full setup" ? "Copied" : "Copy full setup"}
          </Button>
          <Button asChild variant="outline">
            <a href="https://suno.com/create" target="_blank" rel="noreferrer">
              Open Suno
              <ArrowUpRight size={14} />
            </a>
          </Button>
        </div>
      </Dialog>
      {toast && (
        <div className="toast" role="status">
          <CheckCheck size={17} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function AdviceItem({ advice: a, number }: { advice: Advice; number: number }) {
  return (
    <article className={cn("advice-item", a.level === "warning" && "warning")}>
      <span className="advice-number">{String(number).padStart(2, "0")}</span>
      <div>
        <h4>{a.title}</h4>
        <p>{a.detail}</p>
        <a href={sources[a.source]} target="_blank" rel="noreferrer">
          {fieldLabels[a.field]} ·{" "}
          {a.source === "sonoya"
            ? "Guide recommendation"
            : "Suno documentation"}
          <ArrowUpRight size={10} />
        </a>
      </div>
    </article>
  );
}

function AuthForm({
  mode,
  onMode,
  onSuccess,
  registration,
}: {
  mode: "login" | "register";
  onMode: (m: "login" | "register") => void;
  onSuccess: (u: User) => void;
  registration: boolean;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className="auth-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const credentials = credentialsSchema.safeParse({
          email: email.trim(),
          password,
        });
        if (!credentials.success) {
          setError(formatValidationError(credentials.error));
          return;
        }
        setBusy(true);
        setError("");
        void api<{ user: User }>(
          mode === "login" ? "/login" : "/register",
          "POST",
          credentials.data,
        )
          .then((r) => onSuccess(r.user))
          .catch((e) => setError(e.message))
          .finally(() => setBusy(false));
      }}
    >
      <div className="field">
        <label htmlFor="auth-email">Email</label>
        <Input
          id="auth-email"
          type="email"
          required
          maxLength={254}
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </div>
      <div className="field">
        <label htmlFor="auth-password">Password</label>
        <Input
          id="auth-password"
          type="password"
          required
          minLength={12}
          maxLength={128}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <p className="field-hint">
          At least 12 characters. Use a unique password.
        </p>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <Button className="full-width" disabled={busy}>
        {busy
          ? "Please wait…"
          : mode === "login"
            ? "Sign in"
            : "Create account"}
        <ArrowRight size={14} />
      </Button>
      {registration && (
        <button
          type="button"
          className="auth-switch"
          onClick={() => {
            onMode(mode === "login" ? "register" : "login");
            setError("");
          }}
        >
          {mode === "login"
            ? "New here? Create an account"
            : "Already have an account? Sign in"}
        </button>
      )}
      <p className="auth-note">
        <ShieldCheck size={13} />
        Your library is private. Sunomat does not connect to your Suno account.
      </p>
      <p className="field-hint">
        Self-hosted accounts have no email verification or email password reset.
        Ask your server operator for account recovery.
      </p>
    </form>
  );
}

function Guide({ onBack, advice }: { onBack: () => void; advice: Advice[] }) {
  const items = [
    [
      "01",
      "A clear sonic brief",
      "Start with one genre, then a tempo, mood, a few concrete instruments and a vocal or production direction. English style tags are a useful starting point, not a requirement.",
    ],
    [
      "02",
      "Use the right field",
      "Style describes wanted sound. Exclude lists unwanted elements. Lyrics contains sung words and short square-bracket section cues. Put slider values in the actual controls.",
    ],
    [
      "03",
      "Structure with intention",
      "Keep lyric lines similar in length. Use [Verse], [Chorus] and [Bridge] on separate lines. Add short section directions, and repeat chorus words for a recognizable hook. Tags are suggestions, not guarantees.",
    ],
    [
      "04",
      "One change at a time",
      "For a controlled comparison, keep Variety at 0 and change one meaningful setting. Listen to both generated takes and write down the difference. Identical settings can still produce different music.",
    ],
    [
      "05",
      "Keep the whole context",
      "Record the model, audio references, persona, voice and personalization. A prompt alone cannot reproduce a sound exactly. Save the result URL and a rating alongside the settings.",
    ],
    [
      "06",
      "Build a reusable practice",
      "Save a proven setup as a template. Use it as a new song, then change the title and lyrics. Old versions stay intact. Every saved snapshot counts toward your 100-version allowance.",
    ],
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span />A LITTLE DIRECTION GOES A LONG WAY
          </div>
          <h1>
            Better briefs. Better takes<span>.</span>
          </h1>
          <p>A practical guide to intentional, repeatable Suno workflows.</p>
        </div>
        <Button variant="outline" onClick={onBack}>
          Back to composer
          <ArrowRight size={14} />
        </Button>
      </div>
      <div className="guide-layout">
        <div>
          <div className="guide-grid">
            {items.map(([n, title, text]) => (
              <Card key={n} className="guide-card">
                <span className="guide-number">{n}</span>
                <h2>{title}</h2>
                <p>{text}</p>
              </Card>
            ))}
          </div>
          <Card className="guide-sources">
            <h2>Read the source. Trust your ears.</h2>
            <p>
              The writing advice follows the Sonoya guide. Model and control
              descriptions are checked against Suno’s documentation. Suggestions
              are deterministic heuristics, not AI evaluation, guaranteed
              results or official validation. Character caps are configurable
              assumptions reviewed on 31 October 2026: Style 1,000, Lyrics
              5,000; the local Exclude allowance is 1,000, not a verified Suno
              limit. Suno’s interface and plan availability may change.
            </p>
            {Object.entries(sources).map(([name, url]) => (
              <a key={name} href={url} target="_blank" rel="noreferrer">
                {name === "sonoya"
                  ? "Sonoya · Suno v6 guide"
                  : name === "v6"
                    ? "Suno · v6 FAQ"
                    : name === "models"
                      ? "Suno · v6 models"
                      : "Suno · Creative sliders"}
                <ArrowUpRight size={14} />
              </a>
            ))}
          </Card>
        </div>
        <Card className="guide-review">
          <h2>
            <Sparkles size={18} />
            Your current setup
          </h2>
          <p className="muted">
            Suggestions across every field. Save partial work whenever you need.
          </p>
          {advice.map((a, i) => (
            <AdviceItem
              key={`${a.field}-${a.title}`}
              advice={a}
              number={i + 1}
            />
          ))}
          {!advice.length && (
            <p>No guidance flags. Test the setup and record what you hear.</p>
          )}
        </Card>
      </div>
    </>
  );
}
