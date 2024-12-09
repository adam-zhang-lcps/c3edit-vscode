import * as vscode from "vscode";
import state from "./state";

export function ensureBackendProcessActive(): boolean {
	if (!state.backendProcess) {
		vscode.window.showErrorMessage("Backend process is not active.");
		return false;
	}

	return true;
}

export function sendMessageToBackend(type: string, json: object): void {
	if (!ensureBackendProcessActive()) {
		return;
	}

	const text = JSON.stringify({
		type,
		...json,
	});
	state.backendProcess?.stdin?.write(`${text}\n`);
}

export function handleBackendOutput(data: Buffer): void {
	try {
		const text = data.toString();
		const messages = text.split("\n");
		messages.forEach((message) => {
			if (!message) {
				return;
			}

			processBackendMessage(JSON.parse(message));
		});
	} catch (error: any) {
		vscode.window.showErrorMessage("Failed to parse backend message!");
		console.warn(`Error: ${error}\nMessage: ${data.toString()}`);
	}
}

// TODO Refactor this monstrosity into separate functions.
function processBackendMessage(message: any): void {
	switch (message.type) {
		case "create_document_response":
			if (state.currentlyCreatingDocument) {
				vscode.window.showInformationMessage(
					`Document created with ID ${message.id}.`,
				);

				state.activeDocumentToID.set(
					state.currentlyCreatingDocument.document,
					message.id,
				);
				state.activeIDToEditor.set(
					message.id,
					state.currentlyCreatingDocument,
				);
				state.currentlyCreatingDocument = undefined;
			} else {
				console.warn(
					"No document was being created when response was received.",
				);
			}
			break;
		case "add_peer_response":
			vscode.window.showInformationMessage(
				`Successfully added peer at ${message.address}`,
			);
			break;
		case "change":
			state.queuedChanges.push([message.document_id, message.change]);

			processQueuedChanges();

			break;
		case "join_document_response": {
			const id = message.id;
			const content = message.current_content;

			console.log(
				`Joined document with ID ${id} and initial content ${content}.`,
			);

			vscode.workspace
				.openTextDocument(
					vscode.Uri.file(id).with({ scheme: "untitled" }),
				)
				.then((document) => {
					return vscode.window.showTextDocument(document);
				})
				.then((editor) => {
					editor.edit((builder) => {
						builder.insert(new vscode.Position(0, 0), content);
					});
					state.activeDocumentToID.set(editor.document, id);
					state.activeIDToEditor.set(id, editor);
				});

			break;
		}
		case "set_cursor": {
			const editor = state.activeIDToEditor.get(message.document_id)!;
			const location = message.location;
			const peerID = message.peer_id;

			if (!peerID) {
				// Our cursor
				const selection = editor.selection;
				const position = editor.document.positionAt(location);

				if (message.mark) {
					editor.selection = new vscode.Selection(
						position,
						selection.active,
					);
				} else {
					editor.selection = new vscode.Selection(
						selection.anchor,
						position,
					);
				}
			} else {
				// Peer cursor
				// TODO Properly support multiple peers

				if (!state.peerIDToCursor.has(message.document_id)) {
					state.peerIDToCursor.set(message.document_id, new Map());
				}
				const documentCursors = state.peerIDToCursor.get(
					message.document_id,
				);
				if (!documentCursors) {
					// `unset_mark` message was received before `set_cursor`
					// message; ignore.
					return;
				}

				const oldCursor = documentCursors.get(peerID);
				const position = editor.document.positionAt(location);

				if (message.mark) {
					editor.setDecorations(state.peerCursorDecorationType, [
						new vscode.Range(oldCursor!, position),
					]);
				} else {
					editor.setDecorations(state.peerCursorDecorationType, [
						new vscode.Range(position, position),
					]);
					documentCursors.set(message.peer_id, position);
				}
			}

			break;
		}
		case "unset_mark": {
			// TODO It was working fine without this handler, might just not be
			// necessary for VSCode.
			const editor = state.activeIDToEditor.get(message.document_id)!;
			const documentCursors = state.peerIDToCursor.get(
				message.document_id,
			)!;
			const peerID = message.peer_id;

			const oldCursor = documentCursors.get(peerID);
			editor.setDecorations(state.peerCursorDecorationType, [
				new vscode.Range(oldCursor!, oldCursor!),
			]);

			break;
		}
		default:
			console.warn("Unknown message:", JSON.stringify(message));
			break;
	}
}

async function processQueuedChanges(): Promise<void> {
	if (state.isCurrentlyProcessingChanges) {
		return;
	}
	if (state.queuedChanges.length === 0) {
		console.log("No more changes to process.");

		state.isBackendEdit = false;
		return;
	}

	state.isBackendEdit = true;
	state.isCurrentlyProcessingChanges = true;

	// Pop first set of changes from the queue and apply them all
	const [id, change] = state.queuedChanges.shift()!;
	const editor = state.activeIDToEditor.get(id)!;

	const result = await editor.edit((builder) => {
		if (change.type === "insert") {
			const position = editor.document.positionAt(change.index);
			builder.insert(position, change.text);
		} else if (change.type === "delete") {
			const start = editor.document.positionAt(change.index);
			const end = editor.document.positionAt(change.index + change.len);
			builder.delete(new vscode.Range(start, end));
		} else {
			console.warn(`Unknown change: ${JSON.stringify(change)}`);
		}
	});

	if (!result) {
		console.warn("Failed to apply changes to editor.");
	}

	state.isCurrentlyProcessingChanges = false;
	processQueuedChanges();
}
