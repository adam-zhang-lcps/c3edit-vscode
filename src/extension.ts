// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "c3edit" is now active!');

	// Retrieve the backend path from the configuration
	const backendPath = vscode.workspace.getConfiguration().get<string>('c3edit.backendPath', '');
  console.log(`Backend path: ${backendPath}`);
  
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('c3edit.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from c3edit!');
	});

	// Register a new command to run the backend binary
	const runBackendDisposable = vscode.commands.registerCommand('c3edit.runBackend', () => {
		if (backendPath) {
			const { exec } = require('child_process');
			exec(backendPath, (error: any, stdout: string, stderr: string) => {
				if (error) {
					vscode.window.showErrorMessage(`Error executing backend: ${error.message}`);
					return;
				}
				if (stderr) {
					vscode.window.showErrorMessage(`Backend error: ${stderr}`);
					return;
				}
				vscode.window.showInformationMessage(`Backend output: ${stdout}`);
			});
		} else {
			vscode.window.showErrorMessage('Backend path is not set. Please configure it in the settings.');
		}
	});

	context.subscriptions.push(runBackendDisposable);

	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
