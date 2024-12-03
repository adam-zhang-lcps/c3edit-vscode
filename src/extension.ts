// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';

// Global variable to store the process handle
let backendProcess: ChildProcess | undefined;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext): void {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "c3edit" is now active!');

  // Retrieve the backend path from the configuration
  const backendPath = vscode.workspace.getConfiguration().get<string>('c3edit.backendPath', '');
  console.log(`Backend path: ${backendPath}`);
  
  // Register a new command to run the backend binary
  context.subscriptions.push(
    vscode.commands.registerCommand('c3edit.runBackend', () => {
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
    }));

  context.subscriptions.push(
    vscode.commands.registerCommand('c3edit.createDocument', createDocument)
  );
}

export function deactivate(): void {
  // Terminate the backend process if it's running
  if (backendProcess) {
    backendProcess.kill();
  }
}

function ensureBackendProcessActive(): boolean {
  if (!backendProcess) {
    vscode.window.showErrorMessage('Backend process is not active.');
    return false;
  }
  
  return true;
}

function createDocument(): void {
  if (!ensureBackendProcessActive()) {
    return;
  }
  
  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor) {
    const fileName = activeEditor.document.fileName;
    vscode.window.showInformationMessage(`Current file name: ${fileName}`);
  } else {
    vscode.window.showInformationMessage('No active editor found.');
  }
}

function processBackendMessage(data: Buffer): void {
  try {
    const message = JSON.parse(data.toString());
    vscode.window.showInformationMessage(`Backend message: ${JSON.stringify(message)}`);
  } catch (error: any) {
    vscode.window.showErrorMessage(`Failed to parse backend message: ${error.message}`);
  }
}

function sendMessageToBackend(json: object): void {
  if (!ensureBackendProcessActive()) {
    return;
  }

  const text = JSON.stringify(json);
  backendProcess!.stdin!.write(text + '\n');
}
