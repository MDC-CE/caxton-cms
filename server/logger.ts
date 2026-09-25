import pino from "pino";
import { Writable } from "stream";
import { isWeblifyDebug } from "../shared/debug";
import { buildErrorLogContext } from "./utils/error-log-context";

const isDev = process.env.NODE_ENV !== "production";

type LogSinkFn = (
  ts: number,
  level: "error" | "warn",
  module: string,
  message: string,
  errName: string | null,
  errStack: string | null,
  context: string | null
) => void;

let _logSink: LogSinkFn | null = null;

export function registerLogSink(fn: LogSinkFn): void {
  _logSink = fn;
}

class DbLogStream extends Writable {
  _write(chunk: Buffer, _enc: BufferEncoding, done: (err?: Error) => void) {
    try {
      const line = chunk.toString().trim();
      if (line && _logSink) {
        const obj = JSON.parse(line) as Record<string, unknown> & {
          level?: number;
          time?: number;
          module?: string;
          msg?: string;
          err?: { type?: string; stack?: string } | string;
        };
        if (typeof obj.level === "number" && obj.level >= 40) {
          const levelStr: "error" | "warn" = obj.level >= 50 ? "error" : "warn";
          const err = typeof obj.err === "object" && obj.err !== null ? obj.err : null;
          _logSink(
            obj.time ?? Date.now(),
            levelStr,
            obj.module ?? "unknown",
            obj.msg ?? "",
            err?.type ?? null,
            err?.stack ?? null,
            buildErrorLogContext(obj)
          );
        }
      }
    } catch {
    }
    done();
  }
}

const dbStream = new DbLogStream();

function resolveLogLevel(): string {
  if (process.env.LOG_LEVEL?.trim()) return process.env.LOG_LEVEL.trim();
  if (isWeblifyDebug()) return isDev ? "debug" : "info";
  // Quiet by default (dev and prod) unless debug or explicit LOG_LEVEL
  return "warn";
}

const logLevel = resolveLogLevel();

let rootLogger: pino.Logger;

if (isDev) {
  const prettyStream = pino.transport({
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:HH:MM:ss",
      ignore: "pid,hostname",
    },
  });
  rootLogger = pino(
    { level: logLevel },
    pino.multistream([
      { stream: prettyStream, level: logLevel },
      { stream: dbStream, level: "warn" },
    ])
  );
} else {
  rootLogger = pino(
    { level: logLevel },
    pino.multistream([
      { stream: process.stdout, level: logLevel },
      { stream: dbStream, level: "warn" },
    ])
  );
}

export default rootLogger;

export function child(bindings: Record<string, unknown>) {
  return rootLogger.child(bindings);
}
