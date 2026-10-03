import { describe, expect, it } from "vitest";
import { pcm16ToBase64 } from "./pcm";
import { RealtimeClient, openRealtimeSocket, type RealtimeSocketFactory } from "./realtime-client";
import { REALTIME_URL } from "./xai-config";

class FakeSocket {
  static last: FakeSocket | null = null;
  url: string;
  protocols: string[];
  sent: string[] = [];

  constructor(url: string, protocols?: string[]) {
    this.url = url;
    this.protocols = protocols ?? [];
    FakeSocket.last = this;
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {}
}

describe("openRealtimeSocket", () => {
  it("connects with the ephemeral token subprotocol", () => {
    openRealtimeSocket("tok-1", FakeSocket as unknown as RealtimeSocketFactory);
    expect(FakeSocket.last?.url).toBe(REALTIME_URL);
    expect(FakeSocket.last?.url).toBe("wss://api.x.ai/v1/realtime?model=grok-voice-latest");
    expect(FakeSocket.last?.protocols).toEqual(["xai-client-secret.tok-1"]);
  });
});

describe("RealtimeClient", () => {
  it("updates the session, streams audio, and answers a function call after playback", async () => {
    const sent: unknown[] = [];
    const tools: string[] = [];
    const audio: Uint8Array[] = [];
    let waited = false;
    const client = new RealtimeClient({
      send: (payload) => sent.push(payload),
      executeTool: async (name) => {
        tools.push(name);
        return { focus: true, id: "enc-1", missMeters: 621 };
      },
      instructions: "Be a calm controller.",
      onAudio: (pcm) => audio.push(pcm),
      waitForPlayback: async () => {
        waited = true;
      },
    });

    client.onOpen();
    expect(sent[0]).toMatchObject({
      type: "session.update",
      session: {
        voice: "eve",
        instructions: "Be a calm controller.",
        turn_detection: null,
        audio: {
          input: { format: { type: "audio/pcm", rate: 24000 } },
          output: { format: { type: "audio/pcm", rate: 24000 } },
        },
      },
    });
    const toolsOnSession = (sent[0] as { session: { tools: { name: string }[] } }).session.tools.map((tool) => tool.name);
    expect(toolsOnSession).toEqual([
      "get_ranked_warnings",
      "get_encounter",
      "explain_dismissed",
      "focus_encounter",
    ]);

    client.appendAudio("QQ==");
    expect(sent).toHaveLength(1);
    await client.handleMessage(JSON.stringify({ type: "session.updated" }));
    expect(sent[1]).toEqual({ type: "input_audio_buffer.append", audio: "QQ==" });

    client.commitTurn();
    expect(sent.at(-2)).toEqual({ type: "input_audio_buffer.commit" });
    expect(sent.at(-1)).toEqual({ type: "response.create" });

    const delta = pcm16ToBase64(Int16Array.from([10, -10]));
    await client.handleMessage(JSON.stringify({ type: "response.output_audio.delta", delta }));
    expect(audio[0]?.byteLength).toBe(4);

    await client.handleMessage(JSON.stringify({ type: "response.created" }));
    await client.handleMessage(
      JSON.stringify({
        type: "response.function_call_arguments.done",
        name: "focus_encounter",
        call_id: "call-1",
        arguments: JSON.stringify({ id: "enc-1" }),
      }),
    );
    await client.handleMessage(JSON.stringify({ type: "response.done" }));

    expect(tools).toEqual(["focus_encounter"]);
    expect(waited).toBe(true);
    const output = sent.find(
      (message) => (message as { type?: string }).type === "conversation.item.create",
    ) as { item: { type: string; call_id: string; output: string } };
    expect(output.item).toMatchObject({ type: "function_call_output", call_id: "call-1" });
    expect(JSON.parse(output.item.output)).toMatchObject({ focus: true, id: "enc-1" });
    expect(sent.at(-1)).toEqual({ type: "response.create" });
  });
});
