# Tree Browser

A minimum desktop web browser whose tabs live in a tree. Create top-level tabs for separate tasks and child tabs for links or research that belong together.

Built with Python, Qt, and Qt WebEngine. The project uses [uv](https://docs.astral.sh/uv/) for environment and dependency management.

## Quick start

Install Python 3.10+ and `uv`, then from this directory run:

```bash
uv sync
uv run tree-browser
```

`uv sync` creates the managed virtual environment and installs Qt WebEngine. The first install is fairly large because it includes a Chromium-based rendering engine.

## Usage

- Enter a full URL, a domain such as `example.com`, or a search phrase in the address bar, then press Enter.
- **New tab** (`Ctrl+T`) creates a top-level tab.
- **New child** (`Ctrl+Shift+T`) adds a child to the selected tab and expands its parent.
- Right-click a link and choose **Open link in new tab**, Ctrl+click it, or middle-click it to create a child tab beneath the page containing that link.
- Select a tab in the left-hand tree to display its page.
- **Close** (`Ctrl+W`) closes the selected tab and all of its descendants.
- Use the back, forward, and reload buttons for navigation.

## Deployment

For a local desktop deployment, install the project into its `uv` environment and start it with:

```bash
uv sync --no-dev
uv run tree-browser
```

To install the launcher into an existing Python environment instead, use `uv tool install .`; it exposes the `tree-browser` command. Qt WebEngine requires a desktop session and cannot run as a headless web service.

## Development

Run the lightweight tests with:

```bash
uv run pytest
```

The source entry point is `src/tree_browser/app.py`.
