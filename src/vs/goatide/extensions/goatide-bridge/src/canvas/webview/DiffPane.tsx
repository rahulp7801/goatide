/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/canvas/webview/DiffPane.tsx - Phase 4 (Plan 04-03) Monaco DiffEditor wrapper.
//
// Monaco loaded from npm bundle (Pitfall 3 - index.tsx calls loader.config({ monaco }) at
// module-load). theme="vs-dark" matches VS Code's default.

import * as React from 'react';
import { DiffEditor } from '@monaco-editor/react';

export interface DiffPaneProps {
	original: string;
	modified: string;
	language: string;
}

export function DiffPane({ original, modified, language }: DiffPaneProps): React.ReactElement {
	return (
		<div className="goatide-canvas-diff-pane">
			<DiffEditor
				height="60vh"
				language={language}
				original={original}
				modified={modified}
				theme="vs-dark"
				options={{
					readOnly: true,
					renderSideBySide: true,
					originalEditable: false,
					automaticLayout: true,
					minimap: { enabled: false },
				}}
			/>
		</div>
	);
}
