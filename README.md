# Markdown Renderer

A beautiful, modern Markdown renderer for macOS built with Electron. tailored for developers and writers who need a fast, aesthetically pleasing way to view and edit Markdown files.

## Features

- **Real-time Rendering**: Instantly see your changes as you type (if integrated with an editor) or drag-and-drop files.
- **Syntax Highlighting**: robust code block highlighting using `highlight.js`.
- **Beautiful Themes**: Choose from multiple themes including Light, Dark, Dracula, GitHub, and more.
- **Drag & Drop**: Simply drag a markdown file into the window to open it.
- **Native macOS Feel**: Designed to blend perfectly with your macOS environment.
- **Export**: (Coming soon) Export your rendered markdown to HTML or PDF.

## Installation

1.  Go to the [Releases](https://github.com/NitinMahajan1/Markdown-renderer/releases) page.
2.  Download the latest `.dmg` file (e.g., `Markdown-Renderer-1.0.0.dmg`).
3.  Open the `.dmg` and drag the "Markdown Renderer" app to your Applications folder.

## Development

If you want to contribute or build the app yourself:

### Prerequisites

- Node.js (v18 or higher recommended)
- npm (usually comes with Node.js)

### Setup

1.  Clone the repository:
    ```bash
    git clone https://github.com/NitinMahajan1/Markdown-renderer.git
    cd Markdown-renderer
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Run the app in development mode:
    ```bash
    npm start
    ```

### Building for Production

To create the `.dmg` installer locally:

```bash
npm run dist
```

The output will be in the `dist/` directory.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Author

**Nitin Mahajan** - [GravitAI](https://github.com/NitinMahajan1)
