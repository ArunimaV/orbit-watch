"use client";

import { useEffect, useRef, useState } from "react";
import { Countdown } from "@/components/Countdown";
import { EncounterRoom, MissionRoomFeed, MissionRoomPresence } from "@/components/MissionRoom";
import { ShareAlertButton } from "@/components/ShareAlertButton";
import { TcaTime } from "@/components/TcaTime";
import { VerifyLink } from "@/components/VerifyLink";
import { VoiceToggle } from "@/components/VoicePreference";
import { DEMO_ENCOUNTER_NORAD, DEMO_NORAD, TRACKABLE_CUBESATS } from "@/lib/constants";
import { formatApproachTime } from "@/lib/time-format";
import { shareAlertText } from "@/lib/share-alert";
import { subscribeFocusEncounter } from "@/lib/focus";
import type { GlobeBoard } from "@/lib/orbit-board";
import type { DismissedExample, DismissedGroup, RankedEvent, Tier } from "@/lib/types";

interface ConjunctionsResponse {
  norad: number;
  satelliteName: string;
  satelliteDetail: string | null;
  horizonHours: number;
  now: string;
  source: "snapshot" | "fixture" | "lookup";
  ok?: boolean;
  message?: string;
  note: string | null;
  totalEvents: number;
  ranked: RankedEvent[];
  dismissed: DismissedGroup[];
  dismissedCount: number;
  error?: string;
}

const TIER_COLOR: Record<Tier, string> = {
  Act: "border-act text-act",
  Watch: "border-watch text-watch",
  Info: "border-info text-info",
};

function formatRange(km: number): string {
  const meters = km * 1000;
  if (meters < 10_000) return `${Math.round(meters).toLocaleString()} m`;
  return `${km.toFixed(2)} km`;
}

function formatScore(score: number): string {
  return score.toFixed(1);
}

function formatMaxProb(prob: number | null): string {
  if (prob === null || !Number.isFinite(prob)) return "unknown";
  return prob.toExponential(2);
}

const DISMISS_PREVIEW = 3;

function DismissedGroupList({ group, now }: { group: DismissedGroup; now: string | null }) {
  const [open, setOpen] = useState(false);
  const expandable = group.examples.length > DISMISS_PREVIEW;
  const shown = expandable && !open ? group.examples.slice(0, DISMISS_PREVIEW) : group.examples;
  const coOrbit = /co-orbiting/i.test(group.reason);

  return (
    <li className="text-xs leading-snug text-muted">
      <span className="text-foreground">{group.reason}</span>
      <span className="font-mono"> · {group.count}</span>
      {shown.length > 0 && (
        <ul className="mt-1 flex flex-col gap-1">
          {shown.map((example) => (
            <DismissedRow key={example.id} example={example} now={now} coOrbit={coOrbit} />
          ))}
        </ul>
      )}
      {expandable && (
        <button
          type="button"
          className="mt-1 text-[10px] tracking-[0.14em] text-muted uppercase hover:text-foreground"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Show less" : `Show all ${group.count}`}
        </button>
      )}
    </li>
  );
}

function DismissedRow({
  example,
  now,
  coOrbit,
}: {
  example: DismissedExample;
  now: string | null;
  coOrbit: boolean;
}) {
  const reasonStat = coOrbit
    ? `${example.relSpeedKms.toFixed(3)} km/s`
    : `${formatRange(example.rangeKm)} · ${formatMaxProb(example.maxProb)}`;
  return (
    <li>
      <span className="text-foreground">{example.otherName}</span>
      <span className="ml-1 font-mono text-[10px] text-muted">{example.otherNorad}</span>
      {example.detail ? ` (${example.detail})` : ""}
      {now && <TcaTime iso={example.tca} nowIso={now} />}
      <span className="block font-mono text-[10px] text-muted">{reasonStat}</span>
    </li>
  );
}

export function WarningList({
  selectedId,
  onSelect,
  onNorad,
  onEvaluated,
  startedAt,
  onThreat,
  onBoard,
}: {
  selectedId: string | null;
  onSelect: (event: RankedEvent | null) => void;
  onNorad?: (norad: number) => void;
  onEvaluated?: (nowIso: string) => void;
  startedAt: number | null;
  onThreat?: (threat: {
    count: number;
    satelliteName: string;
    when: string | null;
    lead: RankedEvent | null;
  }) => void;
  onBoard?: (board: GlobeBoard) => void;
}) {
  const [draft, setDraft] = useState(String(DEMO_NORAD));
  const [norad, setNorad] = useState(String(DEMO_NORAD));
  const [horizon, setHorizon] = useState("168");
  const [data, setData] = useState<ConjunctionsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lookupNote, setLookupNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const appliedRef = useRef<{ norad: string; horizon: string } | null>(null);
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const rankedRef = useRef<RankedEvent[]>([]);
  rankedRef.current = data?.ranked ?? [];
  const onEvaluatedRef = useRef(onEvaluated);
  onEvaluatedRef.current = onEvaluated;
  const onThreatRef = useRef(onThreat);
  onThreatRef.current = onThreat;
  const onBoardRef = useRef(onBoard);
  onBoardRef.current = onBoard;

  const applyRef = useRef<(body: ConjunctionsResponse) => void>(() => {});
  applyRef.current = (body) => {
    setData(body);
    setError(null);
    setLookupNote(null);
    appliedRef.current = { norad: String(body.norad), horizon: String(body.horizonHours) };
    if (body.now) onEvaluatedRef.current?.(body.now);
    const acts = body.ranked.filter((item) => item.tier === "Act");
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const when = acts[0] && body.now ? formatApproachTime(acts[0].tca, zone, new Date(body.now)).relative : null;
    onThreatRef.current?.({
      count: acts.length,
      satelliteName: body.satelliteName,
      when,
      lead: acts[0] ?? null,
    });
    onBoardRef.current?.({
      satelliteName: body.satelliteName,
      ranked: body.ranked,
      dismissedIds: body.dismissed.flatMap((group) => group.examples.map((example) => example.id)),
    });
    onNorad?.(body.norad);
    const stillSelected = body.ranked.some((item) => item.id === selectedIdRef.current);
    if (!stillSelected) {
      const prefer =
        body.norad === DEMO_NORAD
          ? body.ranked.find((item) => item.other.noradId === DEMO_ENCOUNTER_NORAD)
          : undefined;
      onSelect(prefer ?? body.ranked[0] ?? null);
    }
  };

  useEffect(() => {
    if (norad !== String(DEMO_NORAD)) return undefined;
    const controller = new AbortController();
    setLoading(true);
    const clientNow = new Date().toISOString();
    fetch(
      `/api/conjunctions?norad=${encodeURIComponent(norad)}&horizon=${encodeURIComponent(horizon)}&clientNow=${encodeURIComponent(clientNow)}`,
      {
        signal: controller.signal,
      },
    )
      .then(async (response) => {
        const body = (await response.json()) as ConjunctionsResponse;
        if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
        return body;
      })
      .then((body) => {
        applyRef.current(body);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "Could not load warnings");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [norad, horizon, onSelect, onNorad]);

  useEffect(() => {
    if (norad === String(DEMO_NORAD)) return undefined;
    if (appliedRef.current?.norad === norad && appliedRef.current.horizon === horizon) return undefined;
    const controller = new AbortController();
    const clientNow = new Date().toISOString();
    fetch(
      `/api/lookup?norad=${encodeURIComponent(norad)}&horizon=${encodeURIComponent(horizon)}&clientNow=${encodeURIComponent(clientNow)}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        const body = (await response.json()) as ConjunctionsResponse;
        if (!response.ok || body.ok === false) {
          setLookupNote(body.message ?? "Couldn't load close approaches for that CubeSat. The list on screen is unchanged.");
          return;
        }
        applyRef.current(body);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setLookupNote("Couldn't load close approaches for that CubeSat. The list on screen is unchanged.");
      });
    return () => controller.abort();
  }, [norad, horizon, onSelect, onNorad]);

  async function track(raw: string) {
    const trimmed = raw.trim();
    if (!/^\d+$/.test(trimmed) || Number(trimmed) <= 0) {
      setLookupNote("Enter a numeric NORAD ID.");
      return;
    }
    const id = Number(trimmed);
    if (id === DEMO_NORAD) {
      setLookupNote(null);
      setDraft(String(DEMO_NORAD));
      setNorad(String(DEMO_NORAD));
      return;
    }
    setLookupNote("Looking up…");
    try {
      const clientNow = new Date().toISOString();
      const response = await fetch(
        `/api/lookup?norad=${id}&horizon=${encodeURIComponent(horizon)}&clientNow=${encodeURIComponent(clientNow)}`,
      );
      const body = (await response.json()) as ConjunctionsResponse;
      if (!response.ok || body.ok === false) {
        setLookupNote(body.message ?? "Couldn't load close approaches for that CubeSat. The list on screen is unchanged.");
        return;
      }
      applyRef.current(body);
      setDraft(String(id));
      setNorad(String(id));
    } catch {
      setLookupNote("Couldn't load close approaches for that CubeSat. The list on screen is unchanged.");
    }
  }

  function backToSwissCube() {
    setLookupNote(null);
    setDraft(String(DEMO_NORAD));
    setNorad(String(DEMO_NORAD));
  }

  useEffect(() => subscribeFocusEncounter((id) => {
    const match = rankedRef.current.find((item) => item.id === id);
    if (match) onSelect(match);
  }), [onSelect]);

  return (
    <section className="flex min-h-0 flex-col bg-panel">
      <header className="border-b border-edge px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <p className="font-mono text-[11px] tracking-[0.18em] text-accent uppercase">Orbit Watch</p>
          <div className="flex items-center gap-2">
            <MissionRoomPresence />
            <VoiceToggle />
          </div>
        </div>
        <h1 className="mt-1 text-lg leading-tight font-medium">Ranked warnings</h1>
        <MissionRoomFeed />
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void track(draft);
          }}
        >
          <label className="flex flex-col gap-1 text-[11px] tracking-wide text-muted uppercase">
            Track another CubeSat
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              inputMode="numeric"
              className="w-28 rounded border border-edge bg-background px-2 py-1 font-mono text-sm tracking-normal text-foreground normal-case"
              aria-label="NORAD catalog number"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] tracking-wide text-muted uppercase">
            Known
            <select
              aria-label="Well-known CubeSats"
              defaultValue=""
              onChange={(event) => {
                const next = event.target.value;
                event.currentTarget.value = "";
                if (next) {
                  setDraft(next);
                  void track(next);
                }
              }}
              className="rounded border border-edge bg-background px-2 py-1 text-sm tracking-normal text-foreground normal-case"
            >
              <option value="">Pick</option>
              {TRACKABLE_CUBESATS.map((satellite) => (
                <option key={satellite.norad} value={satellite.norad}>
                  {satellite.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] tracking-wide text-muted uppercase">
            Horizon
            <select
              value={horizon}
              onChange={(event) => setHorizon(event.target.value)}
              className="rounded border border-edge bg-background px-2 py-1 text-sm tracking-normal text-foreground normal-case"
              aria-label="Horizon"
            >
              <option value="24">24 hours</option>
              <option value="72">72 hours</option>
              <option value="168">7 days</option>
            </select>
          </label>
          <button
            type="submit"
            className="rounded border border-edge px-2 py-1 text-xs text-foreground hover:border-accent"
          >
            Track
          </button>
          <button
            type="button"
            onClick={backToSwissCube}
            className="px-1 py-1 text-[11px] tracking-wide text-muted uppercase hover:text-foreground"
          >
            Back to SwissCube
          </button>
        </form>
        {lookupNote && <p className="mt-2 text-xs text-muted">{lookupNote}</p>}
        {data && (
          <p className="mt-2 text-xs text-muted">
            {data.satelliteName}
            {data.satelliteDetail ? ` · ${data.satelliteDetail}` : ""}
          </p>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {loading && <p className="text-sm text-muted">Loading warnings…</p>}
        {error && <p className="text-sm text-act">{error}</p>}
        {data && !loading && !error && (
          <div className="flex flex-col gap-3">
            {data.note && (
              <p className="rounded border border-edge bg-background px-3 py-2 text-xs leading-relaxed text-muted">
                {data.note}
              </p>
            )}
            <div className="rounded border border-edge px-3 py-2">
              <p className="text-sm">
                dismissed: <span className="font-mono text-accent">{data.dismissedCount}</span>, here&apos;s why
              </p>
              {data.dismissed.length === 0 ? (
                <p className="mt-1 text-xs text-muted">Nothing was dismissed in this horizon.</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-1.5">
                  {data.dismissed.map((group) => (
                    <DismissedGroupList key={group.reason} group={group} now={data.now} />
                  ))}
                </ul>
              )}
              <p className="mt-2 font-mono text-[11px] text-muted">
                {data.totalEvents} screened · {data.ranked.length} kept
              </p>
            </div>

            {data.ranked.length === 0 && (
              <p className="text-sm text-muted">No warnings left in this horizon after triage.</p>
            )}

            {data.ranked.map((event) => (
              <article
                key={event.id}
                className={`rounded border border-l-4 bg-background px-3 py-2 ${TIER_COLOR[event.tier]} ${
                  event.id === selectedId ? "ring-1 ring-accent" : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(event)}
                  aria-pressed={event.id === selectedId}
                  className="w-full text-left"
                >
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-sm font-medium text-foreground">
                    {event.other.name}
                    <span className="ml-1 font-mono text-[11px] text-muted">
                      {event.other.noradId}
                      {event.other.opsStatus ? ` [${event.other.opsStatus}]` : ""}
                    </span>
                  </h2>
                  <span className={`font-mono text-[11px] tracking-wide uppercase ${TIER_COLOR[event.tier]}`}>
                    {event.tier}
                  </span>
                </div>
                {data.now && startedAt !== null && (
                  <p className="mt-1 font-mono text-sm text-foreground">
                    <Countdown tca={event.tca} evaluatedAt={data.now} startedAt={startedAt} />
                  </p>
                )}
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[12px] text-foreground">
                  <div>
                    <dt className="text-[10px] tracking-wide text-muted uppercase">Score</dt>
                    <dd>{formatScore(event.score)}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] tracking-wide text-muted uppercase">Miss</dt>
                    <dd>{formatRange(event.rangeKm)}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] tracking-wide text-muted uppercase">Rel. speed</dt>
                    <dd>{event.relSpeedKms.toFixed(3)} km/s</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] tracking-wide text-muted uppercase">TCA</dt>
                    <dd className="text-[11px] leading-snug">
                      {data.now ? <TcaTime iso={event.tca} nowIso={data.now} /> : event.tca}
                    </dd>
                  </div>
                </dl>
                <p className="mt-2 text-[11px] text-muted">
                  {event.passes > 1 ? `the same pair, ${event.passes} passes` : "single pass"}
                  {event.flags.stale && event.flags.staleDays !== null
                    ? ` · orbit data is ${event.flags.staleDays.toFixed(1)} days old at TCA`
                    : ""}
                  {event.flags.diluted ? " · diluted, treat max probability as conservative" : ""}
                </p>
                {event.syntheticFields.length > 0 && (
                  <p className="mt-1 text-[11px] text-muted">Not from SOCRATES: {event.syntheticFields.join(", ")}</p>
                )}
                </button>
                <div className="mt-1.5 flex items-center justify-end gap-3">
                  <ShareAlertButton
                    text={shareAlertText({
                      satelliteName: data.satelliteName,
                      event,
                      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
                    })}
                  />
                  <VerifyLink norad={event.ours.noradId} />
                </div>
                <EncounterRoom encounterId={event.id} label={event.other.name} />
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
