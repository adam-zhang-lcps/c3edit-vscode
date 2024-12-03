// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';

// Global variable to store the process handle
let backendProcess: ChildProcess;

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
      backendProcess = spawn(backendPath);

      backendProcess.stdout!.on('data', processBackendMessage);

      backendProcess.stderr!.on('data', (data) => {
        vscode.window.showErrorMessage(`Backend error: ${data}`);
      });

      backendProcess.on('error', (error) => {
        vscode.window.showErrorMessage(`Error executing backend: ${error.message}`);
      });

      backendProcess.on('close', (code) => {
        vscode.window.showInformationMessage(`Backend process exited with code ${code}`);
      });
	} else {
	  vscode.window.showErrorMessage('Backend path is not set. Please configure it in the settings.');
	}
  });

  context.subscriptions.push(runBackendDisposable);

  context.subscriptions.push(disposable);
}

export function deactivate() {
  // Terminate the backend process if it's running
  if (backendProcess) {
    backendProcess.kill();
  }
}

function processBackendMessage(data: Buffer) {
  try {
    const message = JSON.parse(data.toString());
    vscode.window.showInformationMessage(`Backend message: ${JSON.stringify(message)}`);
  } catch (error: any) {
    vscode.window.showErrorMessage(`Failed to parse backend message: ${error.message}`);
  }
}
