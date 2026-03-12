# GDScript Reference CodeLens

Show reference counts above GDScript function definitions in VS Code.

## Features

- Adds CodeLens above `func` definitions in `.gd` files
- Resolves and displays `0 references`, `1 reference`, or `N references`
- Clicking the CodeLens opens the reference list for that function

## Requirements

- godot-tools: https://marketplace.visualstudio.com/items?itemName=geequlim.godot-tools

## Extension Settings

This extension contributes the following setting:

- `gdscriptReferenceCodeLens.enabled`: Enable or disable GDScript reference CodeLens

## Development

```bash
npm install
npm run compile
```

Press `F5` in VS Code to launch an Extension Development Host.

## Packaging

```bash
npm run compile
vsce package
```

## License

MIT
