"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SpacetimeDBProvider, useReducer, useSpacetimeDB, useTable } from "spacetimedb/react";
import { DbConnection, reducers, tables } from "@/lib/spacetime/module_bindings";
import {
  OPERATOR_NAME_KEY,
  SPACETIME_TOKEN_KEY,
  bindMissionFeed,
  defaultOperatorName,
  isOperatorName,
  readOperatorName,
  spacetimeConfig,
} from "@/lib/mission-room";

type StatusName = "Watching" | "Act" | "Dismissed";

interface RoomApi {
  live: boolean;
  needsName: boolean;
  draftName: string;
  setDraftName: (value: string) => void;
  saveName: (value: string) => void;
  nameError: string | null;
  watching: number;
  watcherNames: string[];
  feed: { id: string; text: string; at: string }[];
  statusFor: (encounterId: string) => { status: StatusName; setBy: string } | null;
  notesFor: (encounterId: string) => { id: string; author: string; text: string }[];
  setStatus: (encounterId: string, status: StatusName, label: string) => Promise<void>;
  addNote: (encounterId: string, text: string) => Promise<void>;
}

const RoomContext = createContext<RoomApi | null>(null);

export function MissionRoomProvider({ children }: { children: ReactNode }) {
  const config = spacetimeConfig();
  if (!config) return children;
  return (
    <MissionRoomConnected uri={config.uri} moduleName={config.module}>
      {children}
    </MissionRoomConnected>
  );
}

function MissionRoomConnected({
  uri,
  moduleName,
  children,
}: {
  uri: string;
  moduleName: string;
  children: ReactNode;
}) {
  const builder = useMemo(() => {
    const next = DbConnection.builder().withUri(uri).withDatabaseName(moduleName);
    const token = readToken();
    if (token) next.withToken(token);
    next.onConnect((_conn, _identity, nextToken) => {
      writeToken(nextToken);
    });
    return next;
  }, [uri, moduleName]);

  return (
    <SpacetimeDBProvider connectionBuilder={builder}>
      <MissionRoomState>{children}</MissionRoomState>
    </SpacetimeDBProvider>
  );
}

function MissionRoomState({ children }: { children: ReactNode }) {
  const conn = useSpacetimeDB();
  const [statuses, statusReady] = useTable(tables.threatStatus);
  const [notes, notesReady] = useTable(tables.note);
  const [presence, presenceReady] = useTable(tables.presence);
  const [feedRows, feedReady] = useTable(tables.feed);
  const setStatusReducer = useReducer(reducers.setStatus);
  const addNoteReducer = useReducer(reducers.addNote);
  const heartbeat = useReducer(reducers.heartbeat);
  const postFeed = useReducer(reducers.postFeed);

  const [savedName, setSavedName] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [nameReady, setNameReady] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const displayName = (savedName ?? draftName).trim();
  const nameRef = useRef(displayName);
  nameRef.current = displayName;

  useEffect(() => {
    const saved = readOperatorName();
    if (saved) {
      setSavedName(saved);
      setDraftName(saved);
    } else {
      setDraftName(defaultOperatorName());
    }
    setNameReady(true);
  }, []);

  const live = conn.isActive && !conn.connectionError && statusReady && notesReady && presenceReady && feedReady;

  useEffect(() => {
    if (!conn.isActive) {
      bindMissionFeed(null);
      return undefined;
    }
    bindMissionFeed((kind, text) => {
      void postFeed({ kind, text }).catch(() => {});
    });
    return () => bindMissionFeed(null);
  }, [conn.isActive, postFeed]);

  useEffect(() => {
    if (!conn.isActive || !nameReady || !isOperatorName(displayName)) return undefined;
    const send = () => {
      void heartbeat({ displayName: nameRef.current }).catch(() => {});
    };
    send();
    const timer = window.setInterval(send, 12_000);
    return () => window.clearInterval(timer);
  }, [conn.isActive, nameReady, displayName, heartbeat]);

  const api = useMemo<RoomApi>(() => {
    return {
      live,
      needsName: live && nameReady && savedName === null,
      draftName,
      setDraftName: (value: string) => {
        setNameError(null);
        setDraftName(value);
      },
      saveName: (value: string) => {
        const next = value.trim().replace(/\s+/g, " ");
        if (!isOperatorName(next)) {
          setNameError("Use letters and numbers, up to 40 characters.");
          return;
        }
        try {
          localStorage.setItem(OPERATOR_NAME_KEY, next);
        } catch {
          // The name still applies for this session.
        }
        setSavedName(next);
        setDraftName(next);
        setNameError(null);
      },
      nameError,
      watching: presence.length,
      watcherNames: presence.map((item) => item.displayName).sort((a, b) => a.localeCompare(b)),
      feed: [...feedRows]
        .sort((a, b) => compareBigint(b.id, a.id))
        .slice(0, 3)
        .map((item) => ({
          id: item.id.toString(),
          text: item.text,
          at: formatLocalTime(item.createdAt),
        })),
      statusFor: (encounterId: string) => {
        const row = statuses.find((item) => item.encounterId === encounterId);
        if (!row || !isStatus(row.status)) return null;
        return { status: row.status, setBy: row.setBy };
      },
      notesFor: (encounterId: string) =>
        notes
          .filter((item) => item.encounterId === encounterId)
          .sort((a, b) => compareBigint(a.id, b.id))
          .slice(-3)
          .map((item) => ({ id: item.id.toString(), author: item.author, text: item.text })),
      setStatus: async (encounterId, status, label) => {
        const setBy = nameRef.current;
        await setStatusReducer({ encounterId, status, setBy });
        await postFeed({ kind: "system", text: `${setBy} set ${label} to ${status}`.slice(0, 320) });
      },
      addNote: async (encounterId, text) => {
        await addNoteReducer({ encounterId, author: nameRef.current, text });
      },
    };
  }, [
    live,
    nameReady,
    savedName,
    draftName,
    nameError,
    presence,
    feedRows,
    statuses,
    notes,
    setStatusReducer,
    addNoteReducer,
    postFeed,
  ]);

  return <RoomContext.Provider value={api}>{children}</RoomContext.Provider>;
}

export function MissionRoomPresence() {
  const room = useContext(RoomContext);
  if (!room?.live || room.watching < 1) return null;
  return (
    <p className="font-mono text-[10px] tracking-wide text-accent" title={room.watcherNames.join(", ")}>
      {room.watching} watching
    </p>
  );
}

export function MissionRoomFeed() {
  const room = useContext(RoomContext);
  if (!room?.live) return null;
  if (!room.needsName && room.feed.length === 0) return null;
  return (
    <div className="mt-2">
      {room.needsName && (
        <form
          className="flex flex-wrap items-center gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            room.saveName(room.draftName);
          }}
        >
          <label className="text-[10px] tracking-wide text-muted uppercase" htmlFor="orbit-callsign">
            Callsign
          </label>
          <input
            id="orbit-callsign"
            value={room.draftName}
            maxLength={40}
            aria-label="Display name"
            onChange={(event) => room.setDraftName(event.target.value)}
            className="w-36 rounded border border-edge bg-background px-1.5 py-0.5 font-mono text-[11px] text-foreground"
          />
          <button type="submit" className="text-[10px] tracking-wide text-accent uppercase">
            Join
          </button>
          {room.nameError && <span className="text-[10px] text-act">{room.nameError}</span>}
        </form>
      )}
      {room.feed.length > 0 && (
        <ul className="mt-1.5 flex flex-col gap-0.5" aria-live="polite" aria-label="Mission feed">
          {room.feed.map((item) => (
            <li key={item.id} className="text-[11px] leading-snug text-muted">
              {item.at && <span className="mr-1 font-mono text-[10px] text-accent">{item.at}</span>}
              {item.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function EncounterRoom({ encounterId, label }: { encounterId: string; label: string }) {
  const room = useContext(RoomContext);
  const [draft, setDraft] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  if (!room?.live) return null;
  const status = room.statusFor(encounterId);
  const notes = room.notesFor(encounterId);
  const tone =
    status?.status === "Act"
      ? "border-act text-act"
      : status?.status === "Watching"
        ? "border-watch text-watch"
        : "border-edge text-muted";

  return (
    <div className="mt-2 border-t border-edge pt-1.5">
      <div className="flex items-center justify-between gap-2">
        <select
          aria-label={`Status for ${label}`}
          value={status?.status ?? ""}
          className={`rounded border bg-panel px-1 py-0.5 font-mono text-[10px] tracking-wide uppercase ${tone}`}
          onChange={(event) => {
            const next = event.target.value;
            if (!isStatus(next)) return;
            setProblem(null);
            void room.setStatus(encounterId, next, label).catch((cause: unknown) => {
              setProblem(failureMessage(cause));
            });
          }}
        >
          <option value="" disabled>
            Status
          </option>
          <option value="Watching">Watching</option>
          <option value="Act">Act</option>
          <option value="Dismissed">Dismissed</option>
        </select>
        {status && <span className="truncate text-[10px] text-muted">by {status.setBy}</span>}
      </div>
      {notes.length > 0 && (
        <ul className="mt-1 flex flex-col gap-0.5">
          {notes.map((note) => (
            <li key={note.id} className="text-[11px] leading-snug text-muted">
              <span className="text-foreground">{note.author}</span> {note.text}
            </li>
          ))}
        </ul>
      )}
      <form
        className="mt-1 flex gap-1"
        onSubmit={(event) => {
          event.preventDefault();
          const text = draft.trim();
          if (!text) return;
          setProblem(null);
          void room
            .addNote(encounterId, text)
            .then(() => setDraft(""))
            .catch((cause: unknown) => setProblem(failureMessage(cause)));
        }}
      >
        <input
          value={draft}
          maxLength={280}
          aria-label={`Note for ${label}`}
          placeholder="Note"
          onChange={(event) => setDraft(event.target.value)}
          className="min-w-0 flex-1 rounded border border-edge bg-panel px-1.5 py-0.5 text-[11px] text-foreground"
        />
        <button type="submit" className="text-[10px] tracking-wide text-accent uppercase">
          Add
        </button>
      </form>
      {problem && <p className="mt-0.5 text-[10px] text-act">{problem}</p>}
    </div>
  );
}

function isStatus(value: string): value is StatusName {
  return value === "Watching" || value === "Act" || value === "Dismissed";
}

function compareBigint(a: bigint, b: bigint): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function formatLocalTime(value: { microsSinceUnixEpoch: bigint }): string {
  const date = new Date(Number(value.microsSinceUnixEpoch / BigInt(1000)));
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function failureMessage(cause: unknown): string {
  const text = cause instanceof Error ? cause.message : "";
  if (/invalid|too long|required|must be/i.test(text) && text.length < 140) return text;
  return "Not saved";
}

function readToken(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return localStorage.getItem(SPACETIME_TOKEN_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function writeToken(token: string) {
  try {
    localStorage.setItem(SPACETIME_TOKEN_KEY, token);
  } catch {
    // Private browsing can refuse storage. This tab still stays connected.
  }
}
