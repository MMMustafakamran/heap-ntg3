/**
 * The real terminal of the server a failed take points at.
 *
 * start-all.sh runs each server through `.qa/tools/ptyrun.cjs`, inside a real
 * pseudo-terminal, the way a developer runs it in a terminal tab. Besides the
 * plain `<name>.log` it keeps `<name>.log.pty`: the raw terminal stream
 * (colours, cursor moves, progress lines) exactly as the server printed it.
 *
 * A failed take opens the terminal window on that stream: the end of what the
 * terminal holds right now (its visible screen and some scrollback), then
 * whatever the server keeps printing, live, until it goes quiet. Nothing is
 * typed and nothing is written by the recorder: every byte is the server's.
 *
 * Which server: the same pick as the log tail in the error log (pickLogs):
 * the log this take touched that holds an error, else the last one it touched.
 */
import { closeSync, existsSync, openSync, readFileSync, readSync, statSync } from 'node:fs';
import { type LogSource } from './failure-evidence';
import { pickLogs } from './failure-terminal';

export interface ServerTerminal {
  /** Tab title: the command the terminal is running (ptyrun --name). */
  name: string;
  /** Raw terminal stream file (`<log>.pty`). */
  ptyFile: string;
  cols: number;
  rows: number;
}

/** The server terminal for this take, or null when start-all.sh did not run servers in a PTY. */
export function findServerTerminal(logs: LogSource[], takeText = ''): ServerTerminal | null {
  const withPty = logs.filter((l) => existsSync(`${l.path}.pty`));
  if (!withPty.length) return null;
  const picked = pickLogs(withPty, 3, takeText);
  const src = picked.grepLog ?? picked.logs[picked.logs.length - 1] ?? withPty[0];
  let meta: { name?: string; command?: string; cols?: number; rows?: number } = {};
  try {
    meta = JSON.parse(readFileSync(`${src.path}.pty.json`, 'utf8'));
  } catch {}
  return {
    name: meta.name || meta.command || src.title.replace(/\.log$/, ''),
    ptyFile: `${src.path}.pty`,
    cols: meta.cols || 168,
    rows: meta.rows || 36,
  };
}

function readRange(file: string, from: number, to: number): string {
  const len = Math.max(0, to - from);
  if (!len) return '';
  const buf = Buffer.alloc(len);
  const fd = openSync(file, 'r');
  try {
    readSync(fd, buf, 0, len, from);
  } finally {
    closeSync(fd);
  }
  return buf.toString('utf8');
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Streams the terminal into `write`: first the last `tailBytes` (starting on a
 * line boundary, so no half escape sequence), then new output as it arrives.
 * Returns once nothing new came for `quietMs`, or after `maxLiveMs`.
 */
export async function streamServerTerminal(
  term: ServerTerminal,
  write: (data: string) => void,
  opts: { tailBytes?: number; quietMs?: number; maxLiveMs?: number; signal?: { aborted: boolean } } = {},
): Promise<{ bytes: number }> {
  const tailBytes = opts.tailBytes ?? 48_000;
  const quietMs = opts.quietMs ?? 2500;
  const maxLiveMs = opts.maxLiveMs ?? 8000;
  let pos = statSync(term.ptyFile).size;
  let start = Math.max(0, pos - tailBytes);
  let head = readRange(term.ptyFile, start, pos);
  if (start > 0) {
    const nl = head.indexOf('\n');
    head = nl >= 0 ? head.slice(nl + 1) : head;
  }
  let bytes = head.length;
  if (head) write(head);
  const began = Date.now();
  let lastNew = Date.now();
  while (!opts.signal?.aborted && Date.now() - began < maxLiveMs && Date.now() - lastNew < quietMs) {
    await sleep(200);
    let size = pos;
    try {
      size = statSync(term.ptyFile).size;
    } catch {
      break;
    }
    if (size > pos) {
      const chunk = readRange(term.ptyFile, pos, size);
      pos = size;
      bytes += chunk.length;
      write(chunk);
      lastNew = Date.now();
    }
  }
  return { bytes };
}
