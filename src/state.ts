import * as vscode from "vscode";
import type { ChildProcess } from "node:child_process";

type DocumentID = string;

class GlobalState {
	// Global variable to store the process handle
	backendProcess: ChildProcess | undefined;
	// Global variable to store the document currently being created on the backend.
	currentlyCreatingDocument: vscode.TextEditor | undefined;
	// Global variable to track editors with active documents.
	activeDocumentToID: Map<vscode.TextDocument, DocumentID> = new Map();
	activeIDToEditor: Map<DocumentID, vscode.TextEditor> = new Map();
	// Global variable to track whether the current edit is from this extension
	// to avoid triggering the `onDidChangeTextDocument` event listener.
	isEditing: boolean = false;
	// Global variable to hold queued changes from the backend, since VSCode applies
	// edits asynchronously, and trying to queue multiple simultaneously results in
	// them getting dropped.
	queuedChanges: Array<[DocumentID, any]> = [];
	// Decoration type for peer's cursor.
	peerCursorDecorationType = vscode.window.createTextEditorDecorationType({
		borderColor: "red",
		borderStyle: "solid",
		borderWidth: "1px",
	});
}

export default new GlobalState();
