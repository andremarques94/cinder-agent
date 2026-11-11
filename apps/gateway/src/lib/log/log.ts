type Level = "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

function write(level: Level, event: string, fields: LogFields = {}): void {
  console[level]({ level, event, ...fields });
}

export const log = {
  info: (event: string, fields?: LogFields) => write("info", event, fields),
  warn: (event: string, fields?: LogFields) => write("warn", event, fields),
  error: (event: string, fields?: LogFields) => write("error", event, fields),
};

export function describeError(error: unknown): LogFields {
  if (!(error instanceof Error)) {
    return { error: String(error) };
  }
  return {
    error: `${error.name}: ${error.message}`,
    ...(error.cause === undefined ? {} : { cause: describeError(error.cause) }),
  };
}
