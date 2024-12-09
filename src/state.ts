import * as vscode from 'vscode';
import { ChildProcess } from 'child_process';

type DocumentID = string;

class GlobalState{
  // Global variable to store the process handle
  backendProcess: ChildProcess | undefined;
  // Global variable to store the document currently being created on the backend.
  currentlyCreatingDocument: vscode.TextEditor | undefined;
  // Global variable to track editors with active documents.
  activeDocumentToID: Map<vscode.TextDocument, DocumentID> = new Map();
  activeIDToEditor: Map<DocumentID, vscode.TextEditor> = new Map();
  // Global variable to track whether the current edit is from the backend to
  // avoid triggering the `onDidChangeTextDocument` event listener.
  isBackendEdit: boolean = false;
  // Global variable to hold queued changes from the backend, since VSCode applies
  // edits asynchronously, and trying to queue multiple simultaneously results in
  // them getting dropped.
  queuedChanges: Array<[DocumentID, any]> = [];
  // Global variable to track whether the document is currently being
  // programmatically edited to avoid concurrent edits.
  isCurrentlyProcessingChanges: boolean = false;
  // Decoration type for peer's cursor.
  peerCursorDecorationType = vscode.window.createTextEditorDecorationType({
    borderColor: 'red',
    borderStyle: 'solid',
    borderWidth: '1px'
  });
}

export default new GlobalState();
