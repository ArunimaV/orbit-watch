import { DEMO_NORAD } from "./constants";
import { DISMISS } from "./rank";
import { formatApproachTime, safeTimeZone } from "./time-format";
import { readXaiApiKey, requestTextBrief } from "./xai";
import { MISSING_KEY_MESSAGE } from "./xai-config";
import { loadVoiceContext, type VoiceContext, type VoiceToolOptions } from "./voice-tools";

export interface Briefing {
  text: string;
  source: "grok" | "local";
  mock: boolean;
  message?: string;
  norad: number;
  encounterId: string | null;
}

function falseAlarmSentence(context: VoiceContext): string {
  const coOrbit = context.dismissed.find((group) => group.reason === DISMISS.coOrbiting);
  const low = context.dismissed.find((group) => group.reason === DISMISS.lowProbability);
  const parts: string[] = [];
  const companion = coOrbit?.examples[0]?.otherName;
  if (companion) parts.push(`${companion} is just flying alongside you`);
  if (low) parts.push("the other far misses are too unlikely to matter");
  else if (!companion && context.dismissedCount > 0) {
    parts.push("the rest are false alarms");
  }
  if (parts.length === 0) return "";
  const sentence = parts.join(", and ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + ".";
}

export function localBriefing(context: VoiceContext, timeZone: string, encounterId?: string | null): string {
  const picked =
    (encounterId ? context.ranked.find((event) => event.id === encounterId) : undefined) ?? context.ranked[0] ?? null;

  if (!picked) {
    return `Nothing on the list for ${context.satelliteName} needs a look right now. This is not a maneuver order.`;
  }

  const meters = Math.round(picked.rangeKm * 1000).toLocaleString("en-US");
  const when = formatApproachTime(picked.tca, timeZone, context.now);
  const stale = picked.flags.stale ? " The orbit data is old, so treat this as a heads-up." : "";
  const alarms = falseAlarmSentence(context);

  return [
    `${picked.other.name} is the one threat for ${context.satelliteName}.`,
    `Closest approach is ${when.speech} (${when.utc}), about ${meters} meters, at ${picked.relSpeedKms.toFixed(1)} kilometers per second.${stale}`,
    alarms,
    "Tell the team. This is not a maneuver order.",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Spoken brief only. The realtime voice persona tells Grok to call tools and
 * focus_encounter; this request has no tools, so that wording comes back as
 * filler ("I'll focus the globe…") and gets read aloud.
 */
function briefPersona(timeZone: string, now: Date): string {
  const zone = safeTimeZone(timeZone);
  const clock = formatApproachTime(now.toISOString(), zone, now);
  return `You are Orbit Watch, a calm space-traffic controller for a university CubeSat team. The demo satellite is SwissCube, NORAD 35932, a 1U CubeSat with no thrusters. The listener's time zone is ${zone}. The clock for this briefing is ${clock.local} (${clock.utc}).

Be concise. The numbers are already in the JSON below. Never invent a miss distance, a relative speed, a probability, or a time. Speak the briefing itself. Do not mention tools, looking something up, pulling a pass, or moving the globe.

Lead with the one threat. Cite the miss distance in meters, the relative speed in kilometers per second, and the time of closest approach in the listener's local time, using tcaSpeech from the JSON. If that says tonight or tomorrow, say it that way. Keep the UTC time as a short second mention. Keep the whole briefing under 60 words. Do not list every dismissed warning. Name one false alarm in plain words (for example, "BEESAT-1 is just flying alongside you").

If the orbit data is stale, say so and treat it as a heads-up. Do not give a maneuver order.

End with one next step: notify the team. This is triage, not an operational decision.`;
}

const FILLER_BRIEF =
  /call(?:ing)?\s+(?:the\s+|a\s+)?tools?\b|focus(?:ing)?\s+the\s+globe|focus_encounter|i['’]ll\s+pull|i['’]ll\s+focus|i\s+will\s+pull|i\s+will\s+focus/i;

export function briefingTextIsUsable(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.split(/\s+/).filter(Boolean).length < 20) return false;
  if (FILLER_BRIEF.test(trimmed)) return false;
  return true;
}

function briefPrompt(context: VoiceContext, timeZone: string, encounterId?: string | null): string {
  const data = {
    satellite: context.satelliteName,
    norad: context.norad,
    screened: context.totalEvents,
    dismissedCount: context.dismissedCount,
    dismissed: context.dismissed.map((group) => ({
      reason: group.reason,
      count: group.count,
      examples: group.examples.slice(0, 2).map((example) => example.otherName),
    })),
    ranked: context.ranked.slice(0, 5).map((event) => {
      const when = formatApproachTime(event.tca, timeZone, context.now);
      return {
        id: event.id,
        other: event.other.name,
        tier: event.tier,
        missMeters: Math.round(event.rangeKm * 1000),
        relSpeedKms: event.relSpeedKms,
        tcaLocal: when.label,
        tcaSpeech: when.speech,
        tcaUtc: when.utc,
        stale: event.flags.stale,
        staleDays: event.flags.staleDays,
      };
    }),
    highlightId: encounterId ?? context.ranked[0]?.id ?? null,
  };

  return `${briefPersona(timeZone, context.now)}

Write the spoken briefing now, using only the JSON below. Under 60 words. Plain sentences. No markdown, no bullet list, and no filter labels.
${JSON.stringify(data)}`;
}

export async function createBriefing(input: {
  norad?: number;
  timeZone?: string;
  encounterId?: string | null;
  toolOptions?: VoiceToolOptions;
  apiKey?: string | null;
  fetchImpl?: typeof fetch;
  /** Ranker text only, for the instant transcript placeholder. */
  localOnly?: boolean;
}): Promise<Briefing> {
  const norad = input.norad ?? DEMO_NORAD;
  const timeZone = input.timeZone?.trim() || "UTC";
  const context = loadVoiceContext(norad, input.toolOptions);
  const local = localBriefing(context, timeZone, input.encounterId);
  const apiKey = input.apiKey === undefined ? readXaiApiKey() : input.apiKey;

  if (!apiKey || input.localOnly) {
    return {
      text: local,
      source: "local",
      mock: !apiKey,
      message: apiKey ? undefined : MISSING_KEY_MESSAGE,
      norad,
      encounterId: input.encounterId ?? context.ranked[0]?.id ?? null,
    };
  }

  const grok = await requestTextBrief(briefPrompt(context, timeZone, input.encounterId), {
    apiKey,
    fetchImpl: input.fetchImpl,
  });
  if (!grok.ok) {
    console.error("[orbit-watch] text briefing failed:", grok.message);
    return {
      text: local,
      source: "local",
      mock: false,
      message: `${grok.message} Showing the briefing from the ranker instead.`,
      norad,
      encounterId: input.encounterId ?? context.ranked[0]?.id ?? null,
    };
  }

  if (!briefingTextIsUsable(grok.text)) {
    console.error("[orbit-watch] text briefing rejected:", grok.text);
    return {
      text: local,
      source: "local",
      mock: false,
      norad,
      encounterId: input.encounterId ?? context.ranked[0]?.id ?? null,
    };
  }

  return {
    text: grok.text,
    source: "grok",
    mock: false,
    norad,
    encounterId: input.encounterId ?? context.ranked[0]?.id ?? null,
  };
}
