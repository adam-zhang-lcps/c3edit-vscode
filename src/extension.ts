// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as handlers from './handlers';
import state from './state';
import * as commands from './commands';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext): void {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "c3edit" is now active!');

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('c3edit.runBackend', commands.runBackend)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('c3edit.createDocument', commands.createDocument)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('c3edit.joinDocument', commands.joinDocument)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('c3edit.connectToPeer', commands.connectToPeer)
  );

  // Event handlers
  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection(handlers.onDidChangeTextEditorSelection)
  );
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(handlers.onDidChangeTextDocument)
  );
}

export function deactivate(): void {
  // Terminate the backend process if it's running
  if (state.backendProcess) {
    state.backendProcess.kill();
  }
}

export function ensureBackendProcessActive(): boolean {
  if (!state.backendProcess) {
    vscode.window.showErrorMessage('Backend process is not active.');
    return false;
  }
  
  return true;
}

export function handleBackendOutput(data: Buffer): void {
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
      if (state.currentlyCreatingDocument) {
        vscode.window.showInformationMessage(`Document created with ID ${message.id}.`);
          
        state.activeDocumentToID.set(state.currentlyCreatingDocument.document, message.id);
        state.activeIDToEditor.set(message.id, state.currentlyCreatingDocument)
        state.currentlyCreatingDocument = undefined;
      } else {
        console.warn('No document was being created when response was received.');
      }
      break;
    case 'add_peer_response':
      vscode.window.showInformationMessage(`Successfully added peer at ${message.address}`)
      break;
    case 'change':
      state.queuedChanges.push([message.document_id, message.change]);
      
      processQueuedChanges();
      
      break;
    case 'join_document_response':
      const id = message.id;
      const content = message.current_content;

      console.log(`Joined document with ID ${id} and initial content ${content}.`);
      
      vscode.workspace.openTextDocument({ content }).then(document => {
        return vscode.window.showTextDocument(document);
      }).then(editor => {
        state.activeDocumentToID.set(editor.document, id);
        state.activeIDToEditor.set(id, editor);
      });
      
      break;
    case 'set_cursor':
      const editor = state.activeIDToEditor.get(message.document_id)!;
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
        editor.setDecorations(state.peerCursorDecorationType, [new vscode.Range(position, position)]);
      }

      break;
    default:
      console.warn('Unknown message:', JSON.stringify(message));
      break;
  }
 
}

async function processQueuedChanges(): Promise<void> {
  if (state.isCurrentlyProcessingChanges) {
    return;
  }
  if (state.queuedChanges.length === 0) {
    console.log('No more changes to process.');
    
    state.isBackendEdit = false;
    return;
  }
  
  state.isBackendEdit = true;
  state.isCurrentlyProcessingChanges = true;

  // Pop first set of changes from the queue and apply them all
  const [id, change] = state.queuedChanges.shift()!;
  const editor = state.activeIDToEditor.get(id)!;

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

  state.isCurrentlyProcessingChanges = false;
  processQueuedChanges();
}

export function sendMessageToBackend(type: string, json: object): void {
  if (!ensureBackendProcessActive()) {
    return;
  }

  const text = JSON.stringify({
    type,
    ...json
  });
  state.backendProcess!.stdin!.write(text + '\n');
}
