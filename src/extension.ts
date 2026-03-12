import * as vscode from "vscode";

const SHOW_REFERENCES_COMMAND = "gdscriptReferenceCodeLens.showReferences";

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
    vscode.commands.registerCommand(
      SHOW_REFERENCES_COMMAND,
      async (uri: vscode.Uri, position: vscode.Position) => {
        await showReferencesAtPosition(uri, position);
      }
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

async function showReferencesAtPosition(
  uri: vscode.Uri,
  position: vscode.Position
): Promise<void> {
  const document = await vscode.workspace.openTextDocument(uri);
  const selection = new vscode.Selection(position, position);
  const revealRange = new vscode.Range(position, position);
  const editor = await vscode.window.showTextDocument(document, {
    selection,
    preview: false
  });

  editor.selection = selection;
  editor.revealRange(revealRange, vscode.TextEditorRevealType.InCenterIfOutsideViewport);

  const locations = await getFilteredReferences(uri, position);
  await vscode.commands.executeCommand(
    "editor.action.showReferences",
    uri,
    position,
    locations
  );
}

class GDScriptCodeLens extends vscode.CodeLens {
  constructor(
    range: vscode.Range,
    public readonly documentUri: vscode.Uri,
    public readonly definitionPosition: vscode.Position,
    public readonly funcName: string
  ) {
    super(range);
  }
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

      lenses.push(new GDScriptCodeLens(range, document.uri, position, funcName));
    }

    return lenses;
  }

  async resolveCodeLens(
    codeLens: vscode.CodeLens,
    token: vscode.CancellationToken
  ): Promise<vscode.CodeLens> {
    if (!(codeLens instanceof GDScriptCodeLens)) {
      return codeLens;
    }

    const { documentUri, definitionPosition, funcName } = codeLens;

    try {
      const locations = await getFilteredReferences(documentUri, definitionPosition);

      if (token.isCancellationRequested) {
        return codeLens;
      }
      codeLens.command = buildReferenceCommand(
        formatReferenceTitle(locations.length),
        documentUri,
        definitionPosition,
        funcName
      );
      return codeLens;
    } catch {
      if (token.isCancellationRequested) {
        return codeLens;
      }

      codeLens.command = buildReferenceCommand(
        "0 references",
        documentUri,
        definitionPosition,
        funcName
      );
      return codeLens;
    }
  }
}

function buildReferenceCommand(
  title: string,
  uri: vscode.Uri,
  position: vscode.Position,
  funcName: string
): vscode.Command {
  return {
    title,
    command: SHOW_REFERENCES_COMMAND,
    arguments: [uri, position],
    tooltip: `Show references for ${funcName}`
  };
}

function formatReferenceTitle(count: number): string {
  if (count === 1) {
    return "1 reference";
  }

  return `${count} references`;
}

async function getFilteredReferences(
  uri: vscode.Uri,
  position: vscode.Position
): Promise<vscode.Location[]> {
  const locations = (await vscode.commands.executeCommand<vscode.Location[]>(
    "vscode.executeReferenceProvider",
    uri,
    position
  )) ?? [];

  return locations.filter((loc) => {
    return !sameLocationAsDefinition(loc, uri, position);
  });
}

function sameLocationAsDefinition(
  loc: vscode.Location,
  uri: vscode.Uri,
  position: vscode.Position
): boolean {
  return (
    loc.uri.toString() === uri.toString() &&
    loc.range.contains(position)
  );
}
