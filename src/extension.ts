// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';

type DocumentID = string;

// Global variable to store the process handle
let backendProcess: ChildProcess | undefined;
// Global variable to store the document currently being created on the backend.
let currentlyCreatingDocument: vscode.TextEditor | undefined;
// Global variable to track editors with active documents.
const activeDocumentToID: Map<vscode.TextDocument, DocumentID> = new Map();
const activeIDToEditor: Map<DocumentID, vscode.TextEditor> = new Map();
// Global variable to track whether the current edit is from the backend to
// avoid triggering the `onDidChangeTextDocument` event listener.
let isBackendEdit: boolean = false;
// Global variable to hold queued changes from the backend, since VSCode applies
// edits asynchronously, and trying to queue multiple simultaneously results in
// them getting dropped.
let queuedChanges: Array<[DocumentID, any]> = [];
// Global variable to track whether the document is currently being
// programmatically edited to avoid concurrent edits.
let isCurrentlyProcessingChanges: boolean = false;
// Decoration type for peer's cursor.
const peerCursorDecorationType = vscode.window.createTextEditorDecorationType({
  borderColor: 'red',
  borderStyle: 'solid',
  borderWidth: '1px'
});

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext): void {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "c3edit" is now active!');
  
  // Register a new command to run the backend binary
  context.subscriptions.push(
    vscode.commands.registerCommand('c3edit.runBackend', () => {
      const backendPath = vscode.workspace.getConfiguration().get<string>('c3edit.backendPath', '');
      if (backendPath) {
        const port = vscode.workspace.getConfiguration().get<number>('c3edit.port', 6969);
        backendProcess = spawn(backendPath, ['--port', port.toString()], {
          shell: true
        });

        backendProcess.stdout!.on('data', handleBackendOutput);

        backendProcess.stderr!.on('data', (data) => {
          vscode.window.showErrorMessage(`Backend error: ${data}`);
        });

        backendProcess.on('error', (error) => {
          vscode.window.showErrorMessage(`Error executing backend: ${error.message}`);
        });

        backendProcess.on('close', (code) => {
          vscode.window.showInformationMessage(`Backend process exited with code ${code}`);
        });

        backendProcess.on('spawn', () => {
          vscode.window.showInformationMessage(`Backend process successfully running on port ${port}!`);
        })
	  } else {
	    vscode.window.showErrorMessage('Backend path is not set. Please configure it in the settings.');
	  }
    }));

  context.subscriptions.push(
    vscode.commands.registerCommand('c3edit.createDocument', createDocument)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('c3edit.joinDocument', joinDocument)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('c3edit.connectToPeer', connectToPeer)
  );

  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection(onDidChangeTextEditorSelection)
  );
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(onDidChangeTextDocument)
  );
}

async function joinDocument(): Promise<void> {
  if (!ensureBackendProcessActive()) {
    return;
  }

  const documentID = await vscode.window.showInputBox({
    prompt: 'Enter the document ID to join',
    placeHolder: 'e.g., 12345'
  });

  if (documentID) {
    sendMessageToBackend("join_document", { id: documentID });
    vscode.window.showInformationMessage(`Joining document with ID ${documentID}…`);
  } else {
    vscode.window.showInformationMessage('No document ID provided.');
  }
}

function getAbsoluteIndex(document: vscode.TextDocument, position: vscode.Position): number {
  let absoluteIndex = 0;

  // Sum the lengths of all lines before the current line
  for (let i = 0; i < position.line; i++) {
    absoluteIndex += document.lineAt(i).text.length + 1; // +1 for the newline character
  }

  // Add the character index of the position within its line
  absoluteIndex += position.character;

  return absoluteIndex;
}

export function deactivate(): void {
  // Terminate the backend process if it's running
  if (backendProcess) {
    backendProcess.kill();
  }
}

function onDidChangeTextEditorSelection(e: vscode.TextEditorSelectionChangeEvent): void {
  const editor = e.textEditor;
  const document = editor.document;
  const id = activeDocumentToID.get(document);
  if (!id) {
    return;
  }
  
  const cursor = editor.selection.active;
  const point = getAbsoluteIndex(document, cursor)

  sendMessageToBackend("set_cursor", {document_id: id, location: point});
}

function onDidChangeTextDocument(e: vscode.TextDocumentChangeEvent): void {
  if (isBackendEdit) {
    return;
  }
  
  const document = e.document;
  const id = activeDocumentToID.get(document);
  if (!id) {
    return;
  }

  e.contentChanges.forEach(change => {
    const size = change.rangeLength;
    const range = change.range;
    const text = change.text;
    let backendChange: object | undefined = undefined;


    if (size === 0) {
      // Insertion
      backendChange = {
        type: "insert",
        index: change.rangeOffset,
        text
      };
    } else if (size > 0 && text === "") {
      // Deletion
      backendChange = {
        type: "delete",
        index: change.rangeOffset,
        len: size
      };
    } else {
      console.warn(`Unknown change: ${JSON.stringify(change)}`)
    }

    if (backendChange) {
      sendMessageToBackend("change", {
        document_id: id,
        change: backendChange
      });
    }
  });
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
    const document = activeEditor.document;
    const name = path.basename(document.fileName);
    const initialContent = document.getText();

    currentlyCreatingDocument = activeEditor;
    sendMessageToBackend("create_document", {
      name,
      initial_content: initialContent,
    });
  } else {
    vscode.window.showInformationMessage('No active editor window found.');
  }
}

async function connectToPeer(): Promise<void> {
  if (!ensureBackendProcessActive()) {
    return;
  }

  const peerAddress = await vscode.window.showInputBox({
    prompt: 'Enter the peer address (IP:Port)',
    placeHolder: 'e.g., 192.168.1.1:8080'
  });

  if (peerAddress) {
    sendMessageToBackend("add_peer", { address: peerAddress });
    vscode.window.showInformationMessage(`Connecting to peer at ${peerAddress}…`);
  } else {
    vscode.window.showInformationMessage('No peer address provided.');
  }
}

function handleBackendOutput(data: Buffer): void {
  try {
    const text = data.toString();
    const messages = text.split('\n');
    messages.forEach(message => {
      if (!message) {
        return;
      }
      
      processBackendMessage(JSON.parse(message));
    });
  } catch (error: any) {
    vscode.window.showErrorMessage(`Failed to parse backend message!`);
    console.warn(`Error: ${error}\nMessage: ${data.toString()}`)
  }
}

function processBackendMessage(message: any): void {
  switch (message.type) {
    case 'create_document_response':
      if (currentlyCreatingDocument) {
        vscode.window.showInformationMessage(`Document created with ID ${message.id}.`);
          
        activeDocumentToID.set(currentlyCreatingDocument.document, message.id);
        activeIDToEditor.set(message.id, currentlyCreatingDocument)
        currentlyCreatingDocument = undefined;
      } else {
        console.warn('No document was being created when response was received.');
      }
      break;
    case 'add_peer_response':
      vscode.window.showInformationMessage(`Successfully added peer at ${message.address}`)
      break;
    case 'change':
      queuedChanges.push([message.document_id, message.change]);
      
      processQueuedChanges();
      
      break;
    case 'join_document_response':
      const id = message.id;
      const content = message.current_content;

      console.log(`Joined document with ID ${id} and initial content ${content}.`);
      
      vscode.workspace.openTextDocument({ content }).then(document => {
        return vscode.window.showTextDocument(document);
      }).then(editor => {
        activeDocumentToID.set(editor.document, id);
        activeIDToEditor.set(id, editor);
      });
      
      break;
    case 'set_cursor':
      const editor = activeIDToEditor.get(message.document_id)!;
      const location = message.location;
      const peerID = message.peer_id;

      if (!peerID) {
        // Our cursor
        const selection = editor.selection;
        const position = editor.document.positionAt(location);
        editor.selection = new vscode.Selection(selection.anchor, position);
      } else {
        // Peer cursor
        const position = editor.document.positionAt(location);
        editor.setDecorations(peerCursorDecorationType, [new vscode.Range(position, position)]);
      }
        
      break;
    default:
      // console.warn('Unknown message:', JSON.stringify(message));
      break;
  }
 
}

async function processQueuedChanges(): Promise<void> {
  if (isCurrentlyProcessingChanges) {
    return;
  }
  if (queuedChanges.length === 0) {
    console.log('No more changes to process.');
    
    isBackendEdit = false;
    return;
  }
  
  isBackendEdit = true;
  isCurrentlyProcessingChanges = true;

  // Pop first set of changes from the queue and apply them all
  const [id, change] = queuedChanges.shift()!;
  const editor = activeIDToEditor.get(id)!;

  const result = await editor.edit(builder => {
    if (change.type === "insert") {
      const position = editor.document.positionAt(change.index);
      builder.insert(position, change.text);
    } else if (change.type === "delete") {
      const start = editor.document.positionAt(change.index);
      const end = editor.document.positionAt(change.index + change.len);
      builder.delete(new vscode.Range(start, end));
    } else {
      console.warn(`Unknown change: ${JSON.stringify(change)}`)
    }
  })

  if (!result) {
    console.warn('Failed to apply changes to editor.');
  }

  isCurrentlyProcessingChanges = false;
  processQueuedChanges();
}

function sendMessageToBackend(type: string, json: object): void {
  if (!ensureBackendProcessActive()) {
    return;
  }

  const text = JSON.stringify({
    type,
    ...json
  });
  backendProcess!.stdin!.write(text + '\n');
}
