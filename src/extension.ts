import * as vscode from 'vscode';

// Key for storage
const STORAGE_KEY = 'shadowComments_data';

// Data Interface
interface CommentMap {
    [filePath: string]: {
        [lineNumber: string]: string // map line number string -> comment text
    }
}

let decorationType: vscode.TextEditorDecorationType;
let visible = true;

export function activate(context: vscode.ExtensionContext) {
    console.log('Shadow Comments is now active (Universal Mode).');

    // 1. Create the decoration style
    reloadDecorationStyle();

    // 2. Register Commands
    const addCmd = vscode.commands.registerCommand('shadow-comments.addComment', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        const position = editor.selection.active;
        const lineStr = position.line.toString();
        // Use URI to be OS-agnostic (handles Windows C:\ vs Mac / paths automatically)
        const filePath = editor.document.uri.toString();

        // Check if comment exists to pre-fill input
        const currentData = getStoredComments(context);
        const fileData = currentData[filePath] || {};
        const existingComment = fileData[lineStr] || "";

        const input = await vscode.window.showInputBox({
            prompt: "Type your shadow comment (private to you)",
            placeHolder: "e.g., TODO: Check this logic",
            value: existingComment
        });

        if (input !== undefined) {
            saveComment(context, filePath, lineStr, input);
            updateDecorations(editor, context);
        }
    });

    const removeCmd = vscode.commands.registerCommand('shadow-comments.removeComment', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        const lineStr = editor.selection.active.line.toString();
        const filePath = editor.document.uri.toString();

        // Empty string acts as delete
        saveComment(context, filePath, lineStr, "");
        updateDecorations(editor, context);
    });

    const toggleCmd = vscode.commands.registerCommand('shadow-comments.toggleVisibility', () => {
        visible = !visible;
        if (vscode.window.activeTextEditor) {
            updateDecorations(vscode.window.activeTextEditor, context);
        }
    });

    // 3. Register Event Listeners
    
    // Update when switching tabs
    vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) {
            updateDecorations(editor, context);
        }
    }, null, context.subscriptions);

    // Update when typing or scrolling
    vscode.workspace.onDidChangeTextDocument(event => {
        const editor = vscode.window.activeTextEditor;
        if (editor && event.document === editor.document) {
            updateDecorations(editor, context);
        }
    }, null, context.subscriptions);

    // Initial draw
    if (vscode.window.activeTextEditor) {
        updateDecorations(vscode.window.activeTextEditor, context);
    }

    // Listen for config changes
    vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('shadowComments.color')) {
            reloadDecorationStyle();
            if (vscode.window.activeTextEditor) {
                updateDecorations(vscode.window.activeTextEditor, context);
            }
        }
    });

    context.subscriptions.push(addCmd, removeCmd, toggleCmd);
}

// --- HELPER FUNCTIONS ---

function reloadDecorationStyle() {
    if (decorationType) {
        decorationType.dispose();
    }
    
    const configColor = vscode.workspace.getConfiguration('shadowComments').get('color', '#7f8487');

    decorationType = vscode.window.createTextEditorDecorationType({
        after: {
            margin: '0 0 0 2em',
            color: configColor,
            fontStyle: 'italic'
        },
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
    });
}

function getStoredComments(context: vscode.ExtensionContext): CommentMap {
    return context.workspaceState.get<CommentMap>(STORAGE_KEY) || {};
}

function saveComment(context: vscode.ExtensionContext, filePath: string, line: string, text: string) {
    const data = getStoredComments(context);
    
    if (!data[filePath]) {
        data[filePath] = {};
    }

    if (text.trim() === "") {
        delete data[filePath][line]; 
        if (Object.keys(data[filePath]).length === 0) {
            delete data[filePath];
        }
    } else {
        data[filePath][line] = text;
    }

    context.workspaceState.update(STORAGE_KEY, data);
}

function updateDecorations(editor: vscode.TextEditor, context: vscode.ExtensionContext) {
    if (!visible) {
        editor.setDecorations(decorationType, []);
        return;
    }

    const data = getStoredComments(context);
    const fileKey = editor.document.uri.toString();
    const fileComments = data[fileKey];

    if (!fileComments) {
        editor.setDecorations(decorationType, []);
        return;
    }

    const decorations: vscode.DecorationOptions[] = [];

    for (const lineStr of Object.keys(fileComments)) {
        const lineNr = parseInt(lineStr);
        const text = fileComments[lineStr];
        
        if (lineNr < editor.document.lineCount) {
            const range = new vscode.Range(lineNr, 0, lineNr, 0);
            
            const decoration: vscode.DecorationOptions = {
                range: range,
                renderOptions: {
                    after: {
                        contentText: `  // ${text}`
                    }
                }
            };
            decorations.push(decoration);
        }
    }

    editor.setDecorations(decorationType, decorations);
}

export function deactivate() {}