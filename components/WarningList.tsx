"use client";

import { useEffect, useRef, useState } from "react";
import { DEMO_ENCOUNTER_NORAD, DEMO_NORAD } from "@/lib/constants";
import type { DismissedGroup, RankedEvent, Tier } from "@/lib/types";

interface ConjunctionsResponse {
  norad: number;
  satelliteName: string;
  satelliteDetail: string | null;
  horizonHours: number;
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

function formatLocal(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function formatScore(score: number): string {
  return score.toFixed(1);
}

export function WarningList({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (event: RankedEvent | null) => void;
}) {
  const [draft, setDraft] = useState(String(DEMO_NORAD));
  const [norad, setNorad] = useState(String(DEMO_NORAD));
  const [horizon, setHorizon] = useState("168");
  const [data, setData] = useState<ConjunctionsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/conjunctions?norad=${encodeURIComponent(norad)}&horizon=${encodeURIComponent(horizon)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json()) as ConjunctionsResponse;
        if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
        return body;
      })
      .then((body) => {
        setData(body);
        setError(null);
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
  }, [norad, horizon, onSelect]);

  return (
    <section className="flex min-h-0 flex-col bg-panel">
      <header className="border-b border-edge px-4 py-3">
        <p className="font-mono text-[11px] tracking-[0.18em] text-accent uppercase">Orbit Watch</p>
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
                    <li key={group.reason} className="text-xs leading-snug text-muted">
                      <span className="text-foreground">{group.reason}</span>
                      <span className="font-mono"> · {group.count}</span>
                      {group.examples[0] && (
                        <span>
                          {" "}
                          — {group.examples.map((example) => example.otherName).join(", ")}
                          {group.examples[0].detail ? ` (${group.examples[0].detail})` : ""}
                        </span>
                      )}
                    </li>
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
                    <dd className="text-[11px] leading-snug">{formatLocal(event.tca)}</dd>
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
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
