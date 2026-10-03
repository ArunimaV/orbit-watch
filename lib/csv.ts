/**
 * RFC 4180 reader. Quoted fields may contain commas and newlines.
 * A doubled quote inside a quoted field is a literal quote.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      field = "";
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((cell) => cell !== "")) rows.push(row);
  }

  return rows;
}

export async function parseCsvStream(stream: ReadableStream<Uint8Array>): Promise<string[][]> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  const rows: string[][] = [];

  const parser = createCsvPushParser((row) => {
    rows.push(row);
  });

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      const consumed = parser.push(pending);
      pending = pending.slice(consumed);
    }
    pending += decoder.decode();
    parser.push(pending);
    parser.finish();
  } finally {
    reader.releaseLock();
  }

  return rows;
}

/**
 * Incremental CSV parser. `push` returns how many characters were consumed
 * so the caller can keep an incomplete tail.
 */
export function createCsvPushParser(onRow: (row: string[]) => void): {
  push: (chunk: string) => number;
  finish: () => void;
} {
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const emit = () => {
    row.push(field);
    field = "";
    if (row.some((cell) => cell !== "")) onRow(row);
    row = [];
  };

  return {
    push(chunk: string) {
      let i = 0;
      for (; i < chunk.length; i += 1) {
        const char = chunk[i];
        if (inQuotes) {
          if (char === '"') {
            if (i + 1 >= chunk.length) return i;
            if (chunk[i + 1] === '"') {
              field += '"';
              i += 1;
            } else {
              inQuotes = false;
            }
          } else {
            field += char;
          }
          continue;
        }

        if (char === '"') {
          inQuotes = true;
        } else if (char === ",") {
          row.push(field);
          field = "";
        } else if (char === "\n") {
          emit();
        } else if (char !== "\r") {
          field += char;
        }
      }
      return chunk.length;
    },
    finish() {
      if (field.length > 0 || row.length > 0) emit();
    },
  };
}
