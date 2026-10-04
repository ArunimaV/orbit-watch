export const VOICE_TOOL_NAMES = [
  "get_ranked_warnings",
  "get_encounter",
  "explain_dismissed",
  "focus_encounter",
] as const;

export type VoiceToolName = (typeof VOICE_TOOL_NAMES)[number];

export interface VoiceToolSpec {
  type: "function";
  name: VoiceToolName;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
}

export const VOICE_TOOLS: VoiceToolSpec[] = [
  {
    type: "function",
    name: "get_ranked_warnings",
    description:
      "Rank close-approach warnings for a NORAD catalog id. Returns the warnings that still matter, plus how many were dismissed and why.",
    parameters: {
      type: "object",
      properties: {
        norad: {
          type: "integer",
          description: "NORAD catalog number of the satellite on screen.",
        },
      },
      required: ["norad"],
    },
  },
  {
    type: "function",
    name: "get_encounter",
    description:
      "Look up one encounter by id. Returns miss distance, relative speed, local time of closest approach, tier, and propagated altitude when elements exist.",
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Encounter id from get_ranked_warnings.",
        },
      },
      required: ["id"],
    },
  },
  {
    type: "function",
    name: "explain_dismissed",
    description:
      "Explain the false alarms dismissed for a NORAD catalog id, grouped by reason, with example objects.",
    parameters: {
      type: "object",
      properties: {
        norad: {
          type: "integer",
          description: "NORAD catalog number of the satellite on screen.",
        },
      },
      required: ["norad"],
    },
  },
  {
    type: "function",
    name: "focus_encounter",
    description:
      "Point the globe at one encounter. Call this when you talk about a specific pass. The id comes from get_ranked_warnings.",
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Encounter id to focus.",
        },
      },
      required: ["id"],
    },
  },
];

export function isVoiceToolName(name: string): name is VoiceToolName {
  return (VOICE_TOOL_NAMES as readonly string[]).includes(name);
}
