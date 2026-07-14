# Tree Tabs for Firefox

Tree Tabs is a Firefox WebExtension that brings the previous `tree-browser` project’s organization model into a normal Firefox window: tabs stay in Firefox’s content area, while a vertical tree lives in Firefox’s left sidebar.

## Features

- Top-level tabs represent separate tasks or workspaces.
- Child tabs are inferred from Firefox’s tab opener relationship.
- **New child tab** opens a blank tab beneath the selected tab.
- Right-click a page link and choose **Open link in child tab** to preserve research hierarchy.
- Closing a tab from the tree closes that tab and all descendants.
- Dragging a row moves its whole subtree under another tab or into a new top-level tree.
- Named, colored sub-forest groups collect multiple top-level trees in the sidebar.
- Middle-clicking a sidebar tab closes that tab and its descendants.
- Collapse state is remembered per Firefox window.
- Toolbar buttons and keyboard commands are available for creating and closing trees.

Firefox’s built-in horizontal tab strip remains visible. WebExtensions cannot replace or remove that browser chrome, so the sidebar is the vertical tab surface and stays synchronized with the native tabs.

## Try it locally

1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. Click **Load Temporary Add-on…**.
3. Select this project’s `manifest.json`.
4. Open the Firefox sidebar and choose **Tree Tabs** if it is not already open.

The toolbar button supplied by the extension toggles the sidebar. Temporary add-ons are removed when Firefox restarts; load the manifest again for another development session.

## Daily use

- Click **＋** for a top-level tab.
- Click **↳** for a child of the selected or active tab.
- Use the disclosure arrow to collapse a branch.
- Drag the grip beside a tab onto another row to make it a child subtree.
- While dragging, drop onto **Make a top-level tree** to detach the subtree from its parent.
- Drop near the top or bottom edge of another tab to move the whole subtree before or after it; drop in the center to make it a child.
- Click **▦** to select at least two top-level trees and collect them into a named, colored group.
- Use a group header’s edit button to change its name, color, or membership; removing a group leaves its trees open.
- Click a tab title to activate it.
- Click **×** to close a tab and its descendants.
- Middle-click a tab title to close it and its descendants immediately.
- Ctrl-click or middle-click links in Firefox when you want Firefox to assign the current page as their opener; the sidebar will show those tabs as children when Firefox exposes that relationship.

The default extension shortcuts are `Ctrl+Alt+T` for a top-level tab, `Ctrl+Alt+C` for a child tab, and `Ctrl+Alt+W` to close the active tree. Firefox lets users change extension shortcuts at `about:addons` → gear menu → **Manage Extension Shortcuts**.

## Checks

The tree-building model has dependency-free Node tests:

```bash
node --test tests/tree-model.test.mjs
```

For a manual extension check, reload the temporary add-on from `about:debugging` after editing its files and inspect the sidebar’s browser-console errors if Firefox reports a problem.
