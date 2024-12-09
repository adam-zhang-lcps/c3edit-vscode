import * as vscode from "vscode";
import * as path from "path";
import {
	ensureBackendProcessActive,
	sendMessageToBackend,
	handleBackendOutput,
} from "./extension";
import state from "./state";
import { spawn } from "child_process";

export function runBackend(): void {
	const backendPath = vscode.workspace
		.getConfiguration()
		.get<string>("c3edit.backendPath", "");
	if (backendPath) {
		const port = vscode.workspace
			.getConfiguration()
			.get<number>("c3edit.port", 6969);
		state.backendProcess = spawn(backendPath, ["--port", port.toString()], {
			shell: true,
		});

		state.backendProcess.stdout!.on("data", handleBackendOutput);

		state.backendProcess.stderr!.on("data", (data) => {
			vscode.window.showErrorMessage(`Backend error: ${data}`);
		});

		state.backendProcess.on("error", (error) => {
			vscode.window.showErrorMessage(
				`Error executing backend: ${error.message}`,
			);
		});

		state.backendProcess.on("close", (code) => {
			vscode.window.showInformationMessage(
				`Backend process exited with code ${code}`,
			);
		});

		state.backendProcess.on("spawn", () => {
			vscode.window.showInformationMessage(
				`Backend process successfully running on port ${port}!`,
			);
		});
	} else {
		vscode.window.showErrorMessage(
			"Backend path is not set. Please configure it in the settings.",
		);
	}
}

export function createDocument(): void {
	if (!ensureBackendProcessActive()) {
		return;
	}

	const activeEditor = vscode.window.activeTextEditor;
	if (activeEditor) {
		const document = activeEditor.document;
		const name = path.basename(document.fileName);
		const initialContent = document.getText();

		state.currentlyCreatingDocument = activeEditor;
		sendMessageToBackend("create_document", {
			name,
			initial_content: initialContent,
		});
	} else {
		vscode.window.showInformationMessage("No active editor window found.");
	}
}

export async function joinDocument(): Promise<void> {
	if (!ensureBackendProcessActive()) {
		return;
	}

	const documentID = await vscode.window.showInputBox({
		prompt: "Enter the document ID to join",
		placeHolder: "e.g., 12345",
	});

	if (documentID) {
		sendMessageToBackend("join_document", { id: documentID });
		vscode.window.showInformationMessage(
			`Joining document with ID ${documentID}…`,
		);
	} else {
		vscode.window.showInformationMessage("No document ID provided.");
	}
}

export async function connectToPeer(): Promise<void> {
	if (!ensureBackendProcessActive()) {
		return;
	}

	const peerAddress = await vscode.window.showInputBox({
		prompt: "Enter the peer address (IP:Port)",
		placeHolder: "e.g., 192.168.1.1:8080",
	});

	if (peerAddress) {
		sendMessageToBackend("add_peer", { address: peerAddress });
		vscode.window.showInformationMessage(
			`Connecting to peer at ${peerAddress}…`,
		);
	} else {
		vscode.window.showInformationMessage("No peer address provided.");
	}
}
