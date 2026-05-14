/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/src/inspector/webview/Slider.tsx —
// Phase 15 Plan 15-04 (Wave 3 — DEEP-02 time-travel slider).
//
// `<input type="range">` indexed over the discrete `transitions[]` step set delivered on
// the initial inspector.show (Plan 15-02 queryTimelineTransitions). The slider thumb maps
// to `transitions.indexOf(currentAsOf)`; onChange dispatches a debounced (100ms per
// RESEARCH Open Decision 5) call to `onAsOfChange(transitions[idx])`.
//
// Pitfall 1 fence (REC-03 single-snapshot invariant): the asOf threaded to the host RPC
// comes from `transitions[idx]` verbatim — never from `Date.now()` or `new Date()`-no-arg.
// The display-label below the slider uses `new Date(currentAsOf).toLocaleString()` which
// is a ONE-ARG Date constructor whose input is the bitemporal asOf itself (sourced from
// transitions[]). The fence regex in the plan's verification block matches only zero-arg
// `new Date()` / `new Date(  )` / `Date.now()`; the one-arg form is intentionally permitted
// for display formatting (Issue #6 fix from gsd-plan-checker).

import * as React from 'react';
import { useEffect, useState } from 'react';

export interface SliderProps {
	readonly transitions: readonly string[];
	readonly currentAsOf: string;
	readonly onAsOfChange: (asOf: string) => void;
}

/**
 * Debounced time-travel slider. Internal `pending` state tracks the latest dragged value;
 * a 100ms setTimeout fires `onAsOfChange` only after the user pauses, avoiding a storm of
 * RPCs while the slider thumb is in motion (RESEARCH Open Decision 5).
 *
 * If `currentAsOf` is updated externally (host posted a new inspector.show in response to
 * a previous slider drag), the pending state is reconciled — the debounce guard
 * `pending !== currentAsOf` prevents firing onAsOfChange for the value the host just
 * confirmed.
 */
export function Slider({ transitions, currentAsOf, onAsOfChange }: SliderProps): React.ReactElement {
	const [pending, setPending] = useState<string>(currentAsOf);

	// Reconcile pending when the host confirms a new asOf (e.g. inspector.show arrives with
	// a fresh asOf that didn't originate from this slider's drag).
	useEffect(() => {
		setPending(currentAsOf);
	}, [currentAsOf]);

	useEffect(() => {
		if (pending === currentAsOf) {
			return;
		}
		const handle = setTimeout(() => {
			onAsOfChange(pending);
		}, 100);
		return () => clearTimeout(handle);
	}, [pending, currentAsOf, onAsOfChange]);

	const idx = transitions.indexOf(pending);
	const sliderValue = idx >= 0 ? idx : 0;
	const max = Math.max(0, transitions.length - 1);

	return (
		<div className="inspector-slider">
			<input
				type="range"
				min={0}
				max={max}
				value={sliderValue}
				onChange={(e) => {
					const nextIdx = Number(e.target.value);
					const next = transitions[nextIdx];
					if (next !== undefined) {
						setPending(next);
					}
				}}
			/>
			{/* Display-label only — Pitfall 1 carveout: `new Date(currentAsOf).toLocaleString()` takes the bitemporal asOf as INPUT (sourced from transitions[idx], not Date.now() / new Date()-no-arg). Does not affect the asOf threaded to the kernel RPC, which comes from transitions[idx] verbatim. (Issue #6 fix from gsd-plan-checker.) */}
			<div className="inspector-slider-label">
				Snapshot at {new Date(currentAsOf).toLocaleString()}
			</div>
		</div>
	);
}
