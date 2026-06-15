import { tele } from 'cli-opentelemetry';
import { join } from 'path';
import pkg from '../package.json';

const cliEntry = join(__dirname, 'cli.js');

const endpoint =
  process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ??
  process.env.AIREADY_OTEL_ENDPOINT ??
  'http://localhost:4318/v1/traces';

const headers: Record<string, string> = {};
const headerEnv =
  process.env.OTEL_EXPORTER_OTLP_HEADERS ?? process.env.AIREADY_OTEL_HEADERS;
if (headerEnv) {
  try {
    Object.assign(headers, JSON.parse(headerEnv) as Record<string, string>);
  } catch {
    process.stderr.write(
      'WARN: Invalid OTEL header JSON — expected OTEL_EXPORTER_OTLP_HEADERS={"Authorization":"Bearer ..."}\n',
    );
  }
}

const timeoutMs = Number.parseInt(
  process.env.AIREADY_OTEL_TIMEOUT_MS ?? '3600000',
  10,
);

void tele('aiready', cliEntry, pkg.version, endpoint, headers, timeoutMs);
