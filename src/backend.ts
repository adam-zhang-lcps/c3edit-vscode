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

			const defaultUri =
				vscode.workspace.workspaceFolders?.[0].uri ||
				vscode.Uri.parse("file://");

			vscode.workspace
				.openTextDocument(
					vscode.Uri.joinPath(defaultUri, id).with({
						scheme: "untitled",
					}),
				)
				.then((document) => {
					return vscode.window.showTextDocument(document);
				})
				.then((editor) => {
					state.isBackendEdit = true;
					editor
						.edit((builder) => {
							builder.insert(new vscode.Position(0, 0), content);
						})
						.then(() => {
							state.isBackendEdit = false;
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
				const position = editor.document.positionAt(location);

				// No need to preserve anchor, if it was a selection we would've
				// received `set_selection` instead.
				editor.selection = new vscode.Selection(position, position);
			} else {
				// Peer cursor
				// TODO Properly support multiple peers

				const position = editor.document.positionAt(location);

				editor.setDecorations(state.peerCursorDecorationType, [
					new vscode.Range(position, position),
				]);
			}

			break;
		}
		case "set_selection": {
			const editor = state.activeIDToEditor.get(message.document_id)!;
			const selection = message.selection;
			const peerID = message.peer_id;

			if (!peerID) {
				// Our selection
				const point = editor.document.positionAt(selection.point);
				const mark = editor.document.positionAt(selection.mark);

				editor.selection = new vscode.Selection(mark, point);
			} else {
				// Peer's selection
				// TODO Properly support multiple peers

				const point = editor.document.positionAt(selection.point);
				const mark = editor.document.positionAt(selection.mark);

				editor.setDecorations(state.peerCursorDecorationType, [
					new vscode.Range(mark, point),
				]);
			}

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
