/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Bridge → kernel/dist/canvas dynamic-import helper — Plan 04-06.
//
// Bridge is CJS; kernel/dist is ESM. Static imports across the boundary fail under TS 5.6
// Node16 moduleResolution (TS1479 / TS1541). We use a dynamic import at runtime + locally
// redeclared types (drift caught by Plan 04-02's attempt-payload.spec).
//
// This helper was extracted from tier-dispatch.ts in Plan 04-06 so on-will-save.ts can
// reuse it for the kernel-degraded destructive-block check (CANV-10) without duplicating
// the dynamic-import + cache logic.

export type CanvasTier = 'silent' | 'inline' | 'modal';

export interface CitationDetail {
	node_id: string;
	kind: 'ConstraintNode' | 'DecisionNode' | 'ContractNode' | 'OpenQuestion' | 'Attempt';
	contract_path?: string;
}

// Phase 7 Plan 07-07 — Bridge mirrors of the kernel-side drift surface types. Established
// per the Plan 04-05 CJS↔ESM contract pattern: bridge cannot statically import from
// kernel/dist/drift without bundling, so we redeclare the structural shapes here. They
// MUST stay byte-identical to kernel/src/drift/types.ts (the wire shape is the contract;
// any drift is caught by the bridge integration tests at the IPC boundary).

export interface DriftFinding {
	contract_node_id: string;
	contract_anchor_file: string;
	pattern_index: number;
	pattern_kind: 'regex' | 'jsonpath' | 'forbidden_import';
	file: string;
	hunk_line: number;
	message: string;
}

export interface LockTrigger {
	contract_node_id: string;
	contract_anchor_file: string;
	section_name: string;
	edited_line_range: readonly [number, number];
	hunk_index: number;
}

export interface IntentDriftBadge {
	citation_node_id: string;
	session_priority: string;
	cited_priority: string;
	explanation: string;
}

export interface ComplianceRow {
	node_id: string;
	kind: 'ConstraintNode' | 'DecisionNode' | 'ContractNode' | 'OpenQuestion' | 'Attempt';
	anchor_file?: string;
	edge_path: string;
	hops: 1 | 2 | 3;
	body_preview: string;
}

export interface ComplianceReport {
	contract_node_id: string;
	max_hops: 1 | 2 | 3;
	definitely_affected: ComplianceRow[];
	potentially_affected: ComplianceRow[];
	truncated: boolean;
	generated_at: string;
}

// Phase 7 Plan 07-07 — Drift-surface registry-cache mirror of Plan 04-08's
// AnchorResultCache pattern. Bridge save-gate runDriftAndLock invocation paths can use this
// 60s TTL cache keyed on `${dbPath}|${asOf}` to avoid re-loading the contract registry on
// every save when the asOf hasn't advanced. Eventual consistency at 60s is acceptable per
// ROADMAP SC #5 latency budget; supersede/seed events advance asOf so the cache key
// invalidates naturally.
//
// Today the kernel side runs loadContractRegistry() once per RPC call (per-save fresh).
// This bridge-side cache wraps the RPC response shape (drift_findings + lock_trigger pair)
// and is reserved for future optimization paths (Plan 07-07-iter could use it to short-
// circuit identical-asOf bursts). Plan 07-07's primary save-gate flow does NOT consult this
// cache — it always issues a fresh runDriftAndLock RPC call so the kernel-side authoritative
// drift snapshot is the source of truth.

export interface DriftLockResult {
	drift_findings: DriftFinding[];
	lock_trigger: LockTrigger | null;
}

interface CacheEntry {
	value: DriftLockResult;
	expiresMs: number;
}

const DRIFT_CACHE_TTL_MS = 60_000;

class DriftLockCache {
	private readonly entries = new Map<string, CacheEntry>();
	private readonly ttlMs: number;
	private readonly nowFn: () => number;

	constructor(opts?: { ttlMs?: number; now?: () => number }) {
		this.ttlMs = opts?.ttlMs ?? DRIFT_CACHE_TTL_MS;
		this.nowFn = opts?.now ?? Date.now;
	}

	get(key: string): DriftLockResult | undefined {
		const entry = this.entries.get(key);
		if (entry === undefined) {
			return undefined;
		}
		if (entry.expiresMs <= this.nowFn()) {
			this.entries.delete(key);
			return undefined;
		}
		return entry.value;
	}

	set(key: string, value: DriftLockResult): void {
		this.entries.set(key, { value, expiresMs: this.nowFn() + this.ttlMs });
	}

	clear(): void {
		this.entries.clear();
	}

	size(): number {
		return this.entries.size;
	}
}

let driftCacheInstance: DriftLockCache | undefined;

export function getDriftLockCache(): DriftLockCache {
	if (driftCacheInstance === undefined) {
		driftCacheInstance = new DriftLockCache();
	}
	return driftCacheInstance;
}

/** Test-only: reset the cache so each test starts clean. Not re-exported via index. */
export function __resetDriftLockCacheForTests(): void {
	driftCacheInstance = undefined;
}

export interface TierClassifierInputs {
	receipt: import('../kernel/methods.js').ReasoningReceipt;
	diff: string;
	anchorPath?: string;
	contractAllowlist?: readonly string[];
	citationDetails?: readonly CitationDetail[];
}

// Plan 04-08 — AnchorResultCache surface mirror. Bridge cannot statically import the
// kernel-side concrete class (CJS<->ESM moduleResolution gap, same as the type-mirror
// pattern above), so we declare a structural shape and let the dynamic import resolve
// the real constructor at runtime. The kernel-side AnchorResultCache satisfies this
// shape by construction (kernel/src/test/canvas/anchor-cache.test.ts is the contract test).
export interface AnchorResultCacheLike {
	get(key: string): readonly CitationDetail[] | undefined;
	set(key: string, value: readonly CitationDetail[]): void;
	invalidateByAnchorPath(anchorPath: string): number;
	clear(): void;
	size(): number;
}

export interface AnchorResultCacheLikeCtor {
	new(options?: { maxEntries?: number; ttlMs?: number; now?: () => number }): AnchorResultCacheLike;
}

export interface CanvasModule {
	classifyTier: (inputs: TierClassifierInputs) => CanvasTier;
	detectDestructive: (diff: string, anchorPath?: string) => boolean;
	destructiveVerbForConfirmation: (diff: string) => string;
	DEFAULT_HIGH_IMPACT_CONTRACT_PREFIXES: readonly string[];
	AnchorResultCache: AnchorResultCacheLikeCtor;
	DEFAULT_MAX_ENTRIES: number;
	DEFAULT_TTL_MS: number;
}

let cachedCanvasModule: CanvasModule | undefined;

export async function getCanvasModule(): Promise<CanvasModule> {
	if (cachedCanvasModule) {
		return cachedCanvasModule;
	}
	// Dynamic import bridges CJS bridge to ESM kernel/dist. Path resolved at runtime.
	//
	// Two valid runtime locations of this compiled module:
	//   (1) src/vs/goatide/extensions/goatide-bridge/dist/save-gate/  ← unit tests
	//       (mocha-electron + ts-node-style resolution). 7 `..` reaches the repo root.
	//   (2) extensions/goatide-bridge/dist/save-gate/                 ← extension host
	//       (the bridge-mirror produced by scripts/prepare_goatide.sh). 4 `..` reaches
	//       the repo root.
	// prepare_goatide.sh copies the source dist verbatim, so a single literal import
	// string cannot be correct in both locations. Try the source-test path first; on
	// ERR_MODULE_NOT_FOUND fall back to the mirror path. The successful path is then
	// cached for the rest of the bridge lifetime.
	let mod: unknown;
	try {
		mod = await import('../../../../../../../kernel/dist/canvas/index.js');
	} catch (err) {
		const code = (err as NodeJS.ErrnoException | undefined)?.code;
		if (code === 'ERR_MODULE_NOT_FOUND') {
			// The fallback path (4 `..`) is correct from the mirrored runtime location
			// but does not resolve statically from the source TS location, so we build
			// it from parts to bypass tsc's static module-resolution check. The .d.ts
			// types are still imported via the 7-dot path above.
			const mirrorImportPath: string = ['..', '..', '..', '..', 'kernel', 'dist', 'canvas', 'index.js'].join('/');
			mod = await import(mirrorImportPath);
		} else {
			throw err;
		}
	}
	cachedCanvasModule = mod as unknown as CanvasModule;
	return cachedCanvasModule;
}

/**
 * Phase 12 Plan 12-01 — synchronous accessor for the canvas module.
 *
 * Returns `undefined` if `getCanvasModule()` has never resolved yet (i.e. activation
 * hasn't pre-warmed the cache). on-will-save.ts uses this from the synchronous
 * onWillSaveTextDocument listener body to call `detectDestructive` BEFORE the
 * `event.reason !== Manual` check — `await getCanvasModule()` is not viable inside the
 * listener because the listener must call `event.waitUntil(...)` synchronously per the
 * VS Code save-participant contract (extHostDocumentSaveParticipant.ts:111-131).
 *
 * extension.ts MUST call `await getCanvasModule()` during activate() to pre-warm this
 * cache. Once warmed, every subsequent listener invocation gets the loaded module
 * synchronously.
 */
export function getCanvasModuleSync(): CanvasModule | undefined {
	return cachedCanvasModule;
}
