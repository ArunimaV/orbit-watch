"use client";

import { useEffect, useRef, useState } from "react";
import { Countdown } from "@/components/Countdown";
import { ShareAlertButton } from "@/components/ShareAlertButton";
import { TcaTime } from "@/components/TcaTime";
import { VerifyLink } from "@/components/VerifyLink";
import { VoiceToggle } from "@/components/VoicePreference";
import { DEMO_ENCOUNTER_NORAD, DEMO_NORAD } from "@/lib/constants";
import { formatApproachTime } from "@/lib/time-format";
import { shareAlertText } from "@/lib/share-alert";
import { subscribeFocusEncounter } from "@/lib/focus";
import type { DismissedExample, DismissedGroup, RankedEvent, Tier } from "@/lib/types";

interface ConjunctionsResponse {
  norad: number;
  satelliteName: string;
  satelliteDetail: string | null;
  horizonHours: number;
  now: string;
  source: "snapshot" | "fixture";
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
}) {
  const [draft, setDraft] = useState(String(DEMO_NORAD));
  const [norad, setNorad] = useState(String(DEMO_NORAD));
  const [horizon, setHorizon] = useState("168");
  const [data, setData] = useState<ConjunctionsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const rankedRef = useRef<RankedEvent[]>([]);
  rankedRef.current = data?.ranked ?? [];
  const onEvaluatedRef = useRef(onEvaluated);
  onEvaluatedRef.current = onEvaluated;
  const onThreatRef = useRef(onThreat);
  onThreatRef.current = onThreat;

  useEffect(() => {
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
        setData(body);
        setError(null);
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
        onNorad?.(body.norad);
        const stillSelected = body.ranked.some((item) => item.id === selectedIdRef.current);
        if (!stillSelected) {
          onSelect(body.ranked.find((item) => item.other.noradId === DEMO_ENCOUNTER_NORAD) ?? body.ranked[0] ?? null);
        }
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

  useEffect(() => subscribeFocusEncounter((id) => {
    const match = rankedRef.current.find((item) => item.id === id);
    if (match) onSelect(match);
  }), [onSelect]);

  return (
    <section className="flex min-h-0 flex-col bg-panel">
      <header className="border-b border-edge px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <p className="font-mono text-[11px] tracking-[0.18em] text-accent uppercase">Orbit Watch</p>
          <VoiceToggle />
        </div>
        <h1 className="mt-1 text-lg leading-tight font-medium">Ranked warnings</h1>
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const next = draft.trim();
            if (next) setNorad(next);
          }}
        >
          <label className="flex flex-col gap-1 text-[11px] tracking-wide text-muted uppercase">
            NORAD
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              inputMode="numeric"
              className="w-28 rounded border border-edge bg-background px-2 py-1 font-mono text-sm tracking-normal text-foreground normal-case"
              aria-label="NORAD catalog number"
            />
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
            Load
          </button>
        </form>
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
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
