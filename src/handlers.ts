import type * as vscode from "vscode";
import { sendMessageToBackend } from "./backend";
import state from "./state";

export function onDidChangeTextEditorSelection(
	e: vscode.TextEditorSelectionChangeEvent,
): void {
	const editor = e.textEditor;
	const document = editor.document;
	const id = state.activeDocumentToID.get(document);
	if (!id) {
		return;
	}

	const selection = editor.selection;
	const point = document.offsetAt(selection.active);
	const mark = document.offsetAt(selection.anchor);

	if (selection.isEmpty) {
		sendMessageToBackend("set_cursor", {
			document_id: id,
			location: point,
		});
	} else {
		sendMessageToBackend("set_selection", {
			document_id: id,
			point,
			mark,
		});
	}
}

export function onDidChangeTextDocument(
	e: vscode.TextDocumentChangeEvent,
): void {
	if (state.isEditing) {
		return;
	}

	const document = e.document;
	const id = state.activeDocumentToID.get(document);
	if (!id) {
		return;
	}

	e.contentChanges.forEach((change) => {
		const size = change.rangeLength;
		const range = change.range;
		const text = change.text;
		let backendChange: object | undefined = undefined;

		if (size === 0) {
			// Insertion
			backendChange = {
				type: "insert",
				index: change.rangeOffset,
				text,
			};
		} else if (size > 0 && text === "") {
			// Deletion
			backendChange = {
				type: "delete",
				index: change.rangeOffset,
				len: size,
			};
		} else {
			console.warn(`Unknown change: ${JSON.stringify(change)}`);
		}

		if (backendChange) {
			sendMessageToBackend("change", {
				document_id: id,
				change: backendChange,
			});
		}
	});
}
