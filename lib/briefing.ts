import { DEMO_NORAD } from "./constants";
import { formatLocalTime } from "./time-format";
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

export function localBriefing(context: VoiceContext, timeZone: string, encounterId?: string | null): string {
  const picked =
    (encounterId ? context.ranked.find((event) => event.id === encounterId) : undefined) ?? context.ranked[0] ?? null;
  const dismissedSentence =
    context.dismissed.length === 0
      ? "nothing was dismissed"
      : context.dismissed.map((group) => `${group.count} as ${group.reason}`).join("; ");

  if (!picked) {
    return `I checked ${context.totalEvents} warnings for ${context.satelliteName}. None stayed on the list. ${context.dismissedCount} were dismissed: ${dismissedSentence}. This is triage, not a maneuver order.`;
  }

  const meters = Math.round(picked.rangeKm * 1000).toLocaleString("en-US");
  const when = formatLocalTime(picked.tca, timeZone);
  const stale =
    picked.flags.stale && picked.flags.staleDays !== null
      ? ` Orbit data is about ${picked.flags.staleDays.toFixed(1)} days old at closest approach, so treat this as a heads-up.`
      : "";

  return [
    `${picked.other.name} is the warning to look at for ${context.satelliteName}.`,
    `Closest approach is ${when}, about ${meters} meters, at ${picked.relSpeedKms.toFixed(1)} kilometers per second.`,
    stale.trim(),
    `I dismissed ${context.dismissedCount} of ${context.totalEvents}: ${dismissedSentence}.`,
    "Next step: tell the team and confirm registration for official warnings. This is not a maneuver order.",
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
    ranked: context.ranked.slice(0, 5).map((event) => ({
      id: event.id,
      other: event.other.name,
      tier: event.tier,
      missMeters: Math.round(event.rangeKm * 1000),
      relSpeedKms: event.relSpeedKms,
      tcaLocal: formatLocalTime(event.tca, timeZone),
      stale: event.flags.stale,
      staleDays: event.flags.staleDays,
    })),
    highlightId: encounterId ?? context.ranked[0]?.id ?? null,
  };

  return `${voiceInstructions(timeZone)}

Write the spoken briefing now, using only the JSON below. Plain sentences. No markdown, no bullet list.
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
