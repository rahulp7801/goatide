/*
 * 0005_harvest_tables.sql ==> Phase 5 harvester offset persistence + daily accept-rate metrics.
 *
 * harvest_offsets: TELE-01 chokidar tail offset state. Keyed by absolute path; tracks
 *   last_inode (for POSIX rotation detection) and last_mtime_ms (for Windows fallback).
 *
 * harvest_metrics_daily: PORT-06 per-source accept-rate aggregation. UPSERT via
 *   INSERT ... ON CONFLICT(date_utc, source) DO UPDATE.
 *
 * Comment block uses NO four-char sequence containing dash-dash-greater because drizzle-kit
 * splits on that literal sequence (Plan 04-08 trap). The directional indicator above
 * uses double-arrow ==> instead.
 */
CREATE TABLE harvest_offsets (
    absolute_path TEXT PRIMARY KEY,
    byte_offset INTEGER NOT NULL,
    last_inode INTEGER NOT NULL,
    last_mtime_ms INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE harvest_metrics_daily (
    date_utc TEXT NOT NULL,
    source TEXT NOT NULL,
    submitted INTEGER NOT NULL DEFAULT 0,
    rejected_by_filter INTEGER NOT NULL DEFAULT 0,
    promoted_to_node INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (date_utc, source)
);
