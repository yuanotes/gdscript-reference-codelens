import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
  const provider = new GDScriptReferenceCodeLensProvider();

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      [
        { language: "gdscript", scheme: "file" },
        { language: "gd", scheme: "file" }
      ],
      provider
    )
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (isGDScriptDocument(e.document)) {
        provider.refresh();
      }
    })
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      provider.refresh();
    })
  );
}

export function deactivate() {}

function isGDScriptDocument(doc: vscode.TextDocument): boolean {
  return (
    doc.languageId === "gdscript" ||
    doc.languageId === "gd" ||
    doc.fileName.endsWith(".gd")
  );
}

class GDScriptReferenceCodeLensProvider implements vscode.CodeLensProvider {
  private readonly onDidChangeCodeLensesEmitter = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses = this.onDidChangeCodeLensesEmitter.event;

  refresh() {
    this.onDidChangeCodeLensesEmitter.fire();
  }

  provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.CodeLens[] {
    const config = vscode.workspace.getConfiguration("gdscriptReferenceCodeLens");
    if (!config.get<boolean>("enabled", true)) {
      return [];
    }

    if (!isGDScriptDocument(document)) {
      return [];
    }

    const lenses: vscode.CodeLens[] = [];
    const text = document.getText();
    const lines = text.split(/\r?\n/);

    // 先匹配最常见的 GDScript 函数声明：
    // func foo():
    // static func foo(arg):
    // async func foo():
    const funcRegex = /^(\s*)(static\s+)?(async\s+)?func\s+([A-Za-z_]\w*)\s*\(/;

    for (let line = 0; line < lines.length; line++) {
      const match = lines[line].match(funcRegex);
      if (!match) continue;

      const funcName = match[4];
      const char = lines[line].indexOf(funcName);
      if (char < 0) continue;

      const position = new vscode.Position(line, char);
      const range = new vscode.Range(position, position);

      lenses.push(
        new vscode.CodeLens(range, {
          title: "References: …",
          command: "",
          arguments: [],
          tooltip: `Loading references for ${funcName}`
        })
      );
    }

    return lenses;
  }

  async resolveCodeLens(
    codeLens: vscode.CodeLens,
    token: vscode.CancellationToken
  ): Promise<vscode.CodeLens> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return codeLens;

    const document = editor.document;
    if (!isGDScriptDocument(document)) return codeLens;

    const position = codeLens.range.start;

    try {
      const locations = (await vscode.commands.executeCommand<vscode.Location[]>(
        "vscode.executeReferenceProvider",
        document.uri,
        position
      )) ?? [];

      if (token.isCancellationRequested) {
        return codeLens;
      }

      // 通常引用结果会把定义本身也算进去，减掉当前定义更符合直觉
      const filtered = locations.filter((loc) => {
        return !sameLocationAsDefinition(loc, document.uri, position);
      });

      const count = filtered.length;

      codeLens.command = {
        title: count === 1 ? "1 reference" : `${count} references`,
        command: "editor.action.referenceSearch.trigger",
        arguments: [document.uri, position]
      };

      return codeLens;
    } catch {
      codeLens.command = {
        title: "0 references",
        command: ""
      };
      return codeLens;
    }
  }
}

function sameLocationAsDefinition(
  loc: vscode.Location,
  uri: vscode.Uri,
  position: vscode.Position
): boolean {
  return (
    loc.uri.toString() === uri.toString() &&
    loc.range.start.line === position.line
  );
}