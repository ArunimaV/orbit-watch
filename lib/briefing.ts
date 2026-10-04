import { DEMO_NORAD } from "./constants";
import { DISMISS } from "./rank";
import { formatApproachTime } from "./time-format";
import { readXaiApiKey, requestTextBrief } from "./xai";
import { MISSING_KEY_MESSAGE } from "./xai-config";
import { loadVoiceContext, type VoiceContext, type VoiceToolOptions } from "./voice-tools";
import { voiceInstructions } from "./voice-prompt";

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

  return `${voiceInstructions(timeZone, context.now)}

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
}): Promise<Briefing> {
  const norad = input.norad ?? DEMO_NORAD;
  const timeZone = input.timeZone?.trim() || "UTC";
  const context = loadVoiceContext(norad, input.toolOptions);
  const local = localBriefing(context, timeZone, input.encounterId);
  const apiKey = input.apiKey === undefined ? readXaiApiKey() : input.apiKey;

  if (!apiKey) {
    return {
      text: local,
      source: "local",
      mock: true,
      message: MISSING_KEY_MESSAGE,
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

  return {
    text: grok.text,
    source: "grok",
    mock: false,
    norad,
    encounterId: input.encounterId ?? context.ranked[0]?.id ?? null,
  };
}
