"use client";

import { apiFetch } from "@/services/api";

export interface AppRelease {
  id: string;
  version: string;
  channel: string;
  base_url: string;
  schema_version: number | null;
  notes: string | null;
  is_mandatory: boolean;
  published_at: string | null;
}

export interface UpdateLogRow {
  id: string;
  terminal_name: string;
  from_version: string | null;
  to_version: string | null;
  status: string;
  progress: number | null;
  error: string | null;
  at: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function textOrNull(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

export function schemaNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function displayVersion(version: string | null | undefined): string {
  const v = version?.trim();
  if (!v) return "—";
  return /^v/i.test(v) ? v : `v${v}`;
}

export function compareVersions(a: string, b: string): number {
  const parts = (raw: string) =>
    raw.trim().replace(/^v/i, "").split("-")[0].split(".").map((piece) => {
      const n = parseInt(piece, 10);
      return Number.isFinite(n) ? n : 0;
    });
  const left = parts(a);
  const right = parts(b);
  const len = Math.max(left.length, right.length, 3);
  for (let i = 0; i < len; i += 1) {
    const delta = (left[i] ?? 0) - (right[i] ?? 0);
    if (delta !== 0) return delta < 0 ? -1 : 1;
  }
  return 0;
}

export function isBehind(current: string | null | undefined, latest: string | null | undefined): boolean {
  if (!current || !latest) return false;
  return compareVersions(current, latest) < 0;
}

export function latestRelease(releases: AppRelease[]): AppRelease | null {
  if (releases.length === 0) return null;
  return releases.reduce((best, cur) => (compareVersions(cur.version, best.version) > 0 ? cur : best));
}

export function channelLabel(channel: string): string {
  if (channel === "stable") return "Kararlı";
  if (channel === "beta") return "Beta";
  return channel || "—";
}

export function formatTrDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(date);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${pick("day")}.${pick("month")}.${pick("year")}`;
}

export function releaseOptionLabel(release: AppRelease): string {
  return `${displayVersion(release.version)} — ${formatTrDate(release.published_at)} (${channelLabel(release.channel)})`;
}

function parseRelease(value: unknown): AppRelease | null {
  const row = asRecord(value);
  if (!row) return null;
  const id = textOrNull(row.id);
  const version = textOrNull(row.version);
  if (!id || !version) return null;
  return {
    id,
    version,
    channel: textOrNull(row.channel) ?? "stable",
    base_url: textOrNull(row.base_url) ?? "",
    schema_version: schemaNumber(row.schema_version),
    notes: textOrNull(row.notes),
    is_mandatory: row.is_mandatory === true,
    published_at: textOrNull(row.published_at),
  };
}

function responseList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  const row = asRecord(raw);
  const releases = row?.releases;
  return Array.isArray(releases) ? releases : [];
}

export async function fetchAvailableReleases(companyId: string): Promise<AppRelease[]> {
  try {
    const raw = await apiFetch<unknown>(`/releases/available/${companyId}`);
    return responseList(raw).map(parseRelease).filter((row): row is AppRelease => row != null);
  } catch {
    return [];
  }
}

function parseLog(value: unknown): UpdateLogRow | null {
  const row = asRecord(value);
  if (!row) return null;
  const id = textOrNull(row.id);
  if (!id) return null;
  const terminal = asRecord(row.terminals) ?? asRecord(row.terminal);
  const name = textOrNull(terminal?.terminal_name) ?? textOrNull(row.terminal_name) ?? "Kasa";
  const number = textOrNull(terminal?.terminal_number) ?? textOrNull(row.terminal_number);
  const progress = schemaNumber(row.progress);
  return {
    id,
    terminal_name: number && !name.includes(number) ? `${name} · ${number}` : name,
    from_version: textOrNull(row.from_version),
    to_version: textOrNull(row.to_version),
    status: textOrNull(row.status) ?? "requested",
    progress,
    error: textOrNull(row.error),
    at: textOrNull(row.updated_at) ?? textOrNull(row.created_at),
  };
}

export async function fetchUpdateLogs(companyId: string): Promise<UpdateLogRow[] | null> {
  try {
    const raw = await apiFetch<unknown>(`/releases/updates/${companyId}`);
    const list = Array.isArray(raw) || Array.isArray(asRecord(raw)?.releases)
      ? responseList(raw)
      : null;
    if (!list) return null;
    return list.map(parseLog).filter((row): row is UpdateLogRow => row != null);
  } catch {
    return null;
  }
}

export function updateStillRunning(status: string): boolean {
  return status === "requested"
    || status === "pending"
    || status === "downloading"
    || status === "downloaded"
    || status === "installing"
    || status === "processing";
}

export function VersionHint({
  current,
  latest,
}: {
  current: string | null | undefined;
  latest: string | null | undefined;
}) {
  const behind = isBehind(current, latest);
  const tip = behind && latest ? `${displayVersion(latest)} mevcut` : undefined;
  return (
    <span title={tip} style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
      <span>{displayVersion(current)}</span>
      {behind && (
        <span
          title={tip}
          style={{
            width: 8,
            height: 8,
            borderRadius: 99,
            background: "#F97316",
            display: "inline-block",
            flexShrink: 0,
          }}
        />
      )}
    </span>
  );
}
