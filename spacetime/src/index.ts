import { schema, table, t, SenderError, type InferSchema, type ReducerCtx } from "spacetimedb/server";

const ENCOUNTER_ID_MAX = 128;
const NAME_MAX = 40;
const NOTE_MAX = 280;
const FEED_MAX = 320;
const FEED_KEEP = 40;
const PRESENCE_STALE_MICROS = 45_000_000n;
const FEED_DEDUPE_MICROS = 20_000_000n;

const threatStatus = table(
  { name: "threat_status", public: true },
  {
    encounterId: t.string().primaryKey(),
    status: t.string(),
    setBy: t.string(),
    updatedAt: t.timestamp(),
  },
);

const note = table(
  { name: "note", public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    encounterId: t.string().index("btree"),
    author: t.string(),
    text: t.string(),
    createdAt: t.timestamp(),
  },
);

// connectionId is the key so two tabs of one operator each count as watching.
const presence = table(
  { name: "presence", public: true },
  {
    connectionId: t.connectionId().primaryKey(),
    identity: t.identity(),
    displayName: t.string(),
    lastSeen: t.timestamp(),
  },
);

const feed = table(
  { name: "feed", public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    kind: t.string(),
    text: t.string(),
    createdAt: t.timestamp(),
  },
);

const spacetimedb = schema({ threatStatus, note, presence, feed });
export default spacetimedb;

type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;

function cleanText(value: string, max: number, label: string): string {
  const text = value.trim().replace(/\s+/g, " ");
  if (!text) throw new SenderError(`${label} is required`);
  if (text.length > max) throw new SenderError(`${label} is too long`);
  if (/[\u0000-\u001F\u007F]/.test(text)) throw new SenderError(`${label} has invalid characters`);
  return text;
}

function validateEncounterId(value: string): string {
  const id = value.trim();
  if (!id || id.length > ENCOUNTER_ID_MAX || !/^[A-Za-z0-9._:-]+$/.test(id)) {
    throw new SenderError("Encounter id is invalid");
  }
  return id;
}

function validateName(value: string): string {
  const name = cleanText(value, NAME_MAX, "Name");
  if (!/^[A-Za-z0-9][A-Za-z0-9 ._'’-]{0,39}$/.test(name)) {
    throw new SenderError("Name is invalid");
  }
  return name;
}

function validateStatus(value: string): "Watching" | "Act" | "Dismissed" {
  const status = value.trim();
  if (status === "Watching" || status === "Act" || status === "Dismissed") return status;
  throw new SenderError("Status must be Watching, Act, or Dismissed");
}

function validateKind(value: string): "system" | "grok" {
  const kind = value.trim();
  if (kind === "system" || kind === "grok") return kind;
  throw new SenderError("Feed kind must be system or grok");
}

function prunePresence(ctx: Ctx) {
  const now = ctx.timestamp.microsSinceUnixEpoch;
  for (const row of [...ctx.db.presence.iter()]) {
    if (now - row.lastSeen.microsSinceUnixEpoch > PRESENCE_STALE_MICROS) {
      ctx.db.presence.connectionId.delete(row.connectionId);
    }
  }
}

function pruneFeed(ctx: Ctx) {
  const rows = [...ctx.db.feed.iter()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const extra = rows.length - FEED_KEEP;
  for (let i = 0; i < extra; i += 1) {
    ctx.db.feed.id.delete(rows[i].id);
  }
}

export const init = spacetimedb.init((_ctx) => {});

export const onDisconnect = spacetimedb.clientDisconnected((ctx) => {
  const connectionId = ctx.connectionId;
  if (!connectionId) return;
  if (ctx.db.presence.connectionId.find(connectionId)) {
    ctx.db.presence.connectionId.delete(connectionId);
  }
});

export const setStatus = spacetimedb.reducer(
  { encounterId: t.string(), status: t.string(), setBy: t.string() },
  (ctx, { encounterId, status, setBy }) => {
    const id = validateEncounterId(encounterId);
    const nextStatus = validateStatus(status);
    const name = validateName(setBy);
    const existing = ctx.db.threatStatus.encounterId.find(id);
    if (existing) {
      ctx.db.threatStatus.encounterId.update({
        ...existing,
        status: nextStatus,
        setBy: name,
        updatedAt: ctx.timestamp,
      });
    } else {
      ctx.db.threatStatus.insert({
        encounterId: id,
        status: nextStatus,
        setBy: name,
        updatedAt: ctx.timestamp,
      });
    }
  },
);

export const addNote = spacetimedb.reducer(
  { encounterId: t.string(), author: t.string(), text: t.string() },
  (ctx, { encounterId, author, text }) => {
    const id = validateEncounterId(encounterId);
    const name = validateName(author);
    const body = cleanText(text, NOTE_MAX, "Note");
    ctx.db.note.insert({
      id: 0n,
      encounterId: id,
      author: name,
      text: body,
      createdAt: ctx.timestamp,
    });
  },
);

export const heartbeat = spacetimedb.reducer({ displayName: t.string() }, (ctx, { displayName }) => {
  const connectionId = ctx.connectionId;
  if (!connectionId) throw new SenderError("Presence requires a live connection");
  const name = validateName(displayName);
  const existing = ctx.db.presence.connectionId.find(connectionId);
  if (existing) {
    ctx.db.presence.connectionId.update({
      ...existing,
      displayName: name,
      lastSeen: ctx.timestamp,
    });
  } else {
    ctx.db.presence.insert({
      connectionId,
      identity: ctx.sender,
      displayName: name,
      lastSeen: ctx.timestamp,
    });
  }
  prunePresence(ctx);
});

export const postFeed = spacetimedb.reducer({ kind: t.string(), text: t.string() }, (ctx, { kind, text }) => {
  const nextKind = validateKind(kind);
  const body = cleanText(text, FEED_MAX, "Feed text");
  const now = ctx.timestamp.microsSinceUnixEpoch;
  for (const row of ctx.db.feed.iter()) {
    if (row.text === body && now - row.createdAt.microsSinceUnixEpoch < FEED_DEDUPE_MICROS) return;
  }
  ctx.db.feed.insert({
    id: 0n,
    kind: nextKind,
    text: body,
    createdAt: ctx.timestamp,
  });
  pruneFeed(ctx);
});
