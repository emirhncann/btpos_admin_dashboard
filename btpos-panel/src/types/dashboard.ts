export type AlertLevel = "error" | "warning" | "info";

export interface DashboardAlert {
  code: string;
  level: AlertLevel;
  message: string;
  terminal_id: string | null;
  workplace_id: string | null;
  link: string | null;
}

export interface DashboardPavo {
  serial_no: string | null;
  ip_address: string | null;
  updated_at: string | null;
  updated_from: string | null;
}

export interface DashboardBackup {
  updated_at: string | null;
  machine_name: string | null;
  app_version: string | null;
}

export interface TerminalLastCommand {
  command: string;
  state: string;
  error: string | null;
}

export interface RecentCommand {
  command: string;
  created_at: string | null;
  terminal_name: string | null;
  send_to_all: boolean;
  done: number;
  failed: number;
  total: number;
}

export interface DashboardTerminal {
  id: string;
  terminal_name: string;
  terminal_number: string | null;
  workplace_name: string | null;
  is_installed: boolean;
  pavo: DashboardPavo | null;
  backup: DashboardBackup | null;
  last_command: TerminalLastCommand | null;
  pending_commands: number;
  last_seen: string | null;
}

export interface DashboardSummary {
  generated_at: string | null;
  alerts: DashboardAlert[];
  terminals: DashboardTerminal[];
  recent_commands: RecentCommand[];
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

function numOrZero(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function asBool(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}

function asLevel(value: unknown): AlertLevel {
  if (value === "error" || value === "warning" || value === "info") return value;
  return "info";
}

function mapPavo(value: unknown): DashboardPavo | null {
  const row = asRecord(value);
  if (!row) return null;
  return {
    serial_no: textOrNull(row.serial_no),
    ip_address: textOrNull(row.ip_address),
    updated_at: textOrNull(row.updated_at),
    updated_from: textOrNull(row.updated_from),
  };
}

function mapBackup(value: unknown): DashboardBackup | null {
  const row = asRecord(value);
  if (!row) return null;
  return {
    updated_at: textOrNull(row.updated_at),
    machine_name: textOrNull(row.machine_name),
    app_version: textOrNull(row.app_version),
  };
}

function mapLastCommand(value: unknown): TerminalLastCommand | null {
  const row = asRecord(value);
  if (!row) return null;
  const command = textOrNull(row.command);
  if (!command) return null;
  return {
    command,
    state: textOrNull(row.state ?? row.status) ?? "pending",
    error: textOrNull(row.error),
  };
}

function mapRecentCommand(value: unknown): RecentCommand | null {
  const row = asRecord(value);
  if (!row) return null;
  const command = textOrNull(row.command);
  if (!command) return null;
  return {
    command,
    created_at: textOrNull(row.created_at),
    terminal_name: textOrNull(row.terminal_name),
    send_to_all: asBool(row.send_to_all),
    done: numOrZero(row.done),
    failed: numOrZero(row.failed),
    total: numOrZero(row.total),
  };
}

function mapAlert(value: unknown): DashboardAlert | null {
  const row = asRecord(value);
  if (!row) return null;
  const message = textOrNull(row.message);
  if (!message) return null;
  return {
    code: textOrNull(row.code) ?? "unknown",
    level: asLevel(row.level),
    message,
    terminal_id: textOrNull(row.terminal_id),
    workplace_id: textOrNull(row.workplace_id),
    link: textOrNull(row.link),
  };
}

function mapTerminal(value: unknown): DashboardTerminal | null {
  const row = asRecord(value);
  if (!row) return null;
  const id = textOrNull(row.id);
  if (!id) return null;
  return {
    id,
    terminal_name: textOrNull(row.terminal_name ?? row.name) ?? "Kasa",
    terminal_number: textOrNull(row.terminal_number ?? row.code),
    workplace_name: textOrNull(row.workplace_name),
    is_installed: row.is_installed != null
      ? asBool(row.is_installed)
      : row.is_active != null
        ? asBool(row.is_active)
        : true,
    pavo: mapPavo(row.pavo),
    backup: mapBackup(row.backup),
    last_command: mapLastCommand(row.last_command),
    pending_commands: numOrZero(row.pending_commands),
    last_seen: textOrNull(row.last_seen),
  };
}

export function parseDashboardSummary(raw: unknown): DashboardSummary | null {
  const row = asRecord(raw);
  if (!row || !Array.isArray(row.terminals) || !Array.isArray(row.alerts)) return null;
  return {
    generated_at: textOrNull(row.generated_at),
    alerts: row.alerts
      .map(mapAlert)
      .filter((item): item is DashboardAlert => item != null),
    terminals: row.terminals
      .map(mapTerminal)
      .filter((item): item is DashboardTerminal => item != null),
    recent_commands: (Array.isArray(row.recent_commands) ? row.recent_commands : [])
      .map(mapRecentCommand)
      .filter((item): item is RecentCommand => item != null)
      .slice(0, 10),
  };
}
