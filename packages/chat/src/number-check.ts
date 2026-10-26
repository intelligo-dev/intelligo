/**
 * The number check. A prompt can forbid a number no tool returned; this
 * checks it after the fact. When a reply is done, every number in it is
 * compared, by value and unit (`./numbers.ts`), with what the reader and
 * the tools put in front of the model: the system prompt, the reader's
 * own messages, every tool output on record and this turn's. Never with
 * the assistant's earlier words, so a number it once made up does not
 * become a source.
 *
 * A reply holding any other number gets a note under it, in the same
 * message. The text itself is not rewritten: the stream has already
 * reached the reader.
 */

import type { UIMessageChunk } from "ai";

import {
  createNumberReader,
  type KnownNumbers,
  type NumberReader,
} from "./numbers";

/** What sources a number in a reply: text (the prompt, the reader's words) and tool outputs. */
export interface NumberSources {
  text: string;
  outputs: readonly unknown[];
}

/** A message as the transport keeps it: a role and its parts. */
export interface MessageLike {
  role: string;
  parts?: readonly unknown[];
}

function isToolPart(part: { type?: string }) {
  return part.type?.startsWith("tool-") || part.type === "dynamic-tool";
}

/**
 * The messages as the server recorded them. A turn arrives with whatever
 * the client posted, and a posted tool part is only a claim: a forged
 * output would source a figure no tool returned. The reader's words stay,
 * as they are theirs to say; a tool part stays only as the stored part
 * with its call id says it ran.
 */
export function onRecord(
  incoming: readonly MessageLike[],
  stored: readonly MessageLike[]
): MessageLike[] {
  const ran = new Map<string, unknown>();
  for (const message of stored)
    for (const part of message.parts ?? []) {
      const id = (part as { toolCallId?: unknown }).toolCallId;
      if (typeof id === "string") ran.set(id, part);
    }
  return incoming.map((message) => ({
    role: message.role,
    parts: (message.parts ?? []).flatMap((part) => {
      const p = part as { type?: string; toolCallId?: unknown };
      if (!isToolPart(p)) return [part];
      const recorded =
        typeof p.toolCallId === "string" ? ran.get(p.toolCallId) : undefined;
      return recorded ? [recorded] : [];
    }),
  }));
}

/**
 * What of a conversation sources numbers: the system prompt, the
 * reader's text and every tool output. The assistant's own text is left
 * out.
 */
export function sourcesOf(
  system: string | undefined,
  messages: readonly MessageLike[]
): NumberSources {
  const text = system ? [system] : [];
  const outputs: unknown[] = [];
  for (const message of messages) {
    for (const part of message.parts ?? []) {
      const p = part as {
        type?: string;
        text?: string;
        output?: unknown;
        state?: string;
      };
      if (
        p.type === "text" &&
        message.role === "user" &&
        typeof p.text === "string"
      )
        text.push(p.text);
      else if (isToolPart(p) && p.state === "output-available")
        outputs.push(p.output);
    }
  }
  return { text: text.join("\n"), outputs };
}

/** The numbers in `reply` that neither the sources nor this turn's tool outputs hold. */
export function unsourcedNumbers(
  reply: string,
  sources: NumberSources,
  toolOutputs: readonly unknown[] = [],
  reader: NumberReader = createNumberReader()
): string[] {
  const known: KnownNumbers = reader.addText(new Map(), sources.text);
  for (const output of [...sources.outputs, ...toolOutputs])
    reader.addJson(known, output);
  return reader.unknownNumbers(known, reply);
}

export interface NumberCheckStreamOptions {
  /** What the model was shown before it answered. Read once, when the reply ends. */
  sources: () => NumberSources | Promise<NumberSources>;
  /** The note put under a reply that holds numbers nothing sourced. */
  note: (numbers: string[]) => string;
  onUnknown?: (numbers: string[]) => void | Promise<void>;
  reader?: NumberReader;
}

/**
 * Passes every chunk through, collecting the reply's text and this
 * turn's tool outputs, and adds the note as one more text part when the
 * reply ends: before the message's `finish` when the stream carries one,
 * else when it closes. A reply that errored or was stopped gets no note.
 */
export function numberCheckStream({
  sources,
  note,
  onUnknown,
  reader = createNumberReader(),
}: NumberCheckStreamOptions): TransformStream<UIMessageChunk, UIMessageChunk> {
  let reply = "";
  let ended = false;
  let checked = false;
  const outputs: unknown[] = [];

  async function check(
    controller: TransformStreamDefaultController<UIMessageChunk>
  ) {
    if (checked) return;
    checked = true;
    if (!reply || ended) return;
    let unknown: string[];
    try {
      unknown = unsourcedNumbers(reply, await sources(), outputs, reader);
    } catch {
      // A check that could not read its sources leaves the reply as it is.
      return;
    }
    if (unknown.length === 0) return;
    await onUnknown?.(unknown);
    const id = `number-check-${crypto.randomUUID()}`;
    controller.enqueue({ type: "text-start", id });
    controller.enqueue({
      type: "text-delta",
      id,
      delta: `\n\n${note(unknown)}`,
    });
    controller.enqueue({ type: "text-end", id });
  }

  return new TransformStream<UIMessageChunk, UIMessageChunk>({
    async transform(chunk, controller) {
      if (chunk.type === "text-delta") reply += chunk.delta;
      else if (chunk.type === "tool-output-available" && !chunk.preliminary)
        outputs.push(chunk.output);
      else if (chunk.type === "error" || chunk.type === "abort") ended = true;
      else if (chunk.type === "finish") await check(controller);
      controller.enqueue(chunk);
    },
    async flush(controller) {
      await check(controller);
    },
  });
}
