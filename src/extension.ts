import * as vscode from "vscode";
import * as handlers from "./handlers";
import state from "./state";
import * as commands from "./commands";

export function activate(context: vscode.ExtensionContext): void {
	// Commands
	context.subscriptions.push(
		vscode.commands.registerCommand("c3edit.runBackend", commands.runBackend),
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			"c3edit.createDocument",
			commands.createDocument,
		),
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			"c3edit.joinDocument",
			commands.joinDocument,
		),
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			"c3edit.connectToPeer",
			commands.connectToPeer,
		),
	);

	// Event handlers
	context.subscriptions.push(
		vscode.window.onDidChangeTextEditorSelection(
			handlers.onDidChangeTextEditorSelection,
		),
	);
	context.subscriptions.push(
		vscode.workspace.onDidChangeTextDocument(handlers.onDidChangeTextDocument),
	);
}

export function deactivate(): void {
	// Terminate the backend process if it's running
	if (state.backendProcess) {
		state.backendProcess.kill();
	}
}
