import { buildTree, collectSubtreeIds } from "./tree-model.mjs";
import {
  enrichTabsWithTreeState,
  getWindowTreeGroups,
  setTabTreeGroup,
  setWindowTreeGroups,
} from "./tree-state.mjs";

const COLLAPSED_STORAGE_KEY = "collapsedByWindow";

const state = {
  windowId: null,
  tabs: [],
  collapsed: new Set(),
  refreshSerial: 0,
  refreshTimer: null,
  storageTimer: null,
  messageTimer: null,
  draggedTabId: null,
  groups: [],
};

const treeElement = document.getElementById("tree");
const emptyStateElement = document.getElementById("empty-state");
const tabCountElement = document.getElementById("tab-count");
const windowLabelElement = document.getElementById("window-label");
const messageElement = document.getElementById("message");
const rootDropElement = document.getElementById("root-drop-zone");
const groupDialogElement = document.getElementById("group-dialog");
const groupFormElement = document.getElementById("group-form");
const groupIdElement = document.getElementById("group-id");
const groupNameElement = document.getElementById("group-name");
const groupColorElement = document.getElementById("group-color");
const groupTreeOptionsElement = document.getElementById("group-tree-options");
const groupErrorElement = document.getElementById("group-error");

function tabIdFromRow(row) {
  const tabId = Number(row?.dataset.tabId);
  return Number.isInteger(tabId) ? tabId : null;
}

function activeTab() {
  return state.tabs.find((tab) => tab.active) ?? state.tabs[0] ?? null;
}

function selectedTab() {
  const focusedRow = treeElement.querySelector(".tab-row:focus-within");
  const focusedTabId = tabIdFromRow(focusedRow);
  return state.tabs.find((tab) => tab.id === focusedTabId) ?? activeTab();
}

function tabTitle(tab) {
  return tab.title?.trim() || "New tab";
}

function tabUrlLabel(tab) {
  if (!tab.url || tab.url === "about:blank") {
    return "New tab";
  }

  try {
    const url = new URL(tab.url);
    const host = url.hostname || url.protocol.replace(":", "");
    const path = url.pathname && url.pathname !== "/" ? url.pathname : "";
    return `${host}${path}`;
  } catch {
    return tab.url;
  }
}

function faviconFallback(tab) {
  const fallback = document.createElement("span");
  fallback.className = "favicon-fallback";
  fallback.setAttribute("aria-hidden", "true");
  fallback.textContent = tabTitle(tab).slice(0, 1);
  return fallback;
}

function createFavicon(tab) {
  if (!tab.favIconUrl) {
    return faviconFallback(tab);
  }

  const image = document.createElement("img");
  image.className = "favicon";
  image.alt = "";
  image.src = tab.favIconUrl;
  image.addEventListener("error", () => {
    image.replaceWith(faviconFallback(tab));
  }, { once: true });
  return image;
}

function createStatus(tab) {
  const statuses = document.createElement("span");
  statuses.className = "tab-statuses";
  statuses.setAttribute("aria-hidden", "true");

  if (tab.pinned) {
    const pin = document.createElement("span");
    pin.className = "status";
    pin.textContent = "•";
    pin.title = "Pinned";
    statuses.append(pin);
  }

  if (tab.audible) {
    const audio = document.createElement("span");
    audio.className = "status status-audible";
    audio.textContent = tab.mutedInfo?.muted ? "×" : "◖";
    audio.title = tab.mutedInfo?.muted ? "Muted" : "Playing audio";
    statuses.append(audio);
  }

  if (tab.attention) {
    const attention = document.createElement("span");
    attention.className = "status status-attention";
    attention.textContent = "!";
    attention.title = "Needs attention";
    statuses.append(attention);
  }

  return statuses;
}

function createTabNode(node, depth) {
  const tab = node.tab;
  const listItem = document.createElement("li");
  listItem.className = "tree-node";
  listItem.setAttribute("role", "none");

  const row = document.createElement("div");
  row.className = "tab-row";
  row.dataset.tabId = String(tab.id);
  row.style.setProperty("--depth", String(depth));
  row.classList.toggle("is-active", tab.active);

  const dragHandle = document.createElement("span");
  dragHandle.className = "drag-handle";
  dragHandle.draggable = true;
  dragHandle.tabIndex = 0;
  dragHandle.setAttribute("role", "button");
  dragHandle.setAttribute("aria-label", `Drag ${tabTitle(tab)} and its subtree`);
  dragHandle.title = "Drag this subtree";
  dragHandle.textContent = "⠿";
  row.append(dragHandle);

  const hasChildren = node.children.length > 0;
  const isCollapsed = state.collapsed.has(tab.id);
  if (hasChildren) {
    const twisty = document.createElement("button");
    twisty.className = "twisty";
    twisty.type = "button";
    twisty.dataset.action = "toggle";
    twisty.setAttribute("aria-label", isCollapsed ? "Expand children" : "Collapse children");
    twisty.textContent = isCollapsed ? "▸" : "▾";
    row.append(twisty);
  } else {
    const spacer = document.createElement("span");
    spacer.className = "twisty-spacer";
    spacer.setAttribute("aria-hidden", "true");
    row.append(spacer);
  }

  const tabButton = document.createElement("button");
  tabButton.className = "tab-button";
  tabButton.type = "button";
  tabButton.dataset.action = "activate";
  tabButton.setAttribute("role", "treeitem");
  tabButton.setAttribute("aria-level", String(depth + 1));
  tabButton.setAttribute("aria-selected", String(tab.active));
  tabButton.title = `${tabTitle(tab)}\n${tab.url ?? ""}\nMiddle-click to close this subtree`;
  tabButton.append(createFavicon(tab));

  const copy = document.createElement("span");
  copy.className = "tab-copy";
  const title = document.createElement("span");
  title.className = "tab-title";
  title.textContent = tabTitle(tab);
  const url = document.createElement("span");
  url.className = "tab-url";
  url.textContent = tabUrlLabel(tab);
  copy.append(title, url);
  tabButton.append(copy, createStatus(tab));
  row.append(tabButton);

  const closeButton = document.createElement("button");
  closeButton.className = "tab-close";
  closeButton.type = "button";
  closeButton.dataset.action = "close";
  closeButton.setAttribute("aria-label", `Close ${tabTitle(tab)} and its children`);
  closeButton.title = node.children.length > 0
    ? `Close tab and ${countDescendants(node)} descendants`
    : "Close tab";
  closeButton.textContent = "×";
  row.append(closeButton);
  listItem.append(row);

  if (hasChildren && !isCollapsed) {
    const children = document.createElement("ul");
    children.className = "children tree-list";
    children.setAttribute("role", "group");
    for (const child of node.children) {
      children.append(createTabNode(child, depth + 1));
    }
    listItem.append(children);
  }

  return listItem;
}

function countDescendants(node) {
  return node.children.reduce((count, child) => count + 1 + countDescendants(child), 0);
}

function allBranchIds(nodes, result = []) {
  for (const node of nodes) {
    if (node.children.length > 0) {
      result.push(node.tab.id);
      allBranchIds(node.children, result);
    }
  }
  return result;
}

function createForestGroup(group, roots) {
  const item = document.createElement("li");
  item.className = "forest-group";
  item.dataset.groupId = group.id;
  item.style.setProperty("--group-color", group.color);
  item.setAttribute("role", "none");

  const header = document.createElement("div");
  header.className = "forest-group-header";

  const swatch = document.createElement("span");
  swatch.className = "group-swatch";
  swatch.setAttribute("aria-hidden", "true");

  const name = document.createElement("span");
  name.className = "group-name";
  name.textContent = group.name;

  const count = document.createElement("span");
  count.className = "group-count";
  count.textContent = `${roots.length} ${roots.length === 1 ? "tree" : "trees"}`;

  const edit = document.createElement("button");
  edit.className = "group-header-button";
  edit.type = "button";
  edit.dataset.groupAction = "edit";
  edit.title = `Edit ${group.name}`;
  edit.setAttribute("aria-label", `Edit ${group.name}`);
  edit.textContent = "✎";

  const remove = document.createElement("button");
  remove.className = "group-header-button";
  remove.type = "button";
  remove.dataset.groupAction = "remove";
  remove.title = `Remove ${group.name} without closing its trees`;
  remove.setAttribute("aria-label", `Remove ${group.name}`);
  remove.textContent = "×";

  header.append(swatch, name, count, edit, remove);
  item.append(header);

  if (roots.length === 0) {
    const empty = document.createElement("p");
    empty.className = "forest-group-empty";
    empty.textContent = "No top-level trees in this group.";
    item.append(empty);
    return item;
  }

  const trees = document.createElement("ul");
  trees.className = "forest-group-trees tree-list";
  trees.setAttribute("role", "group");
  for (const root of roots) {
    trees.append(createTabNode(root, 0));
  }
  item.append(trees);
  return item;
}

function render() {
  const roots = buildTree(state.tabs);
  treeElement.replaceChildren();

  const list = document.createElement("ul");
  list.className = "tree-list";
  list.setAttribute("role", "group");

  const knownGroupIds = new Set(state.groups.map((group) => group.id));
  for (const group of state.groups) {
    const groupedRoots = roots.filter((root) => root.tab.treeGroupId === group.id);
    list.append(createForestGroup(group, groupedRoots));
  }

  const ungroupedRoots = roots.filter((root) => !knownGroupIds.has(root.tab.treeGroupId));
  for (const root of ungroupedRoots) {
    list.append(createTabNode(root, 0));
  }
  treeElement.append(list);

  const count = state.tabs.length;
  tabCountElement.textContent = `${count} ${count === 1 ? "tab" : "tabs"}`;
  emptyStateElement.hidden = count !== 0;
  treeElement.hidden = count === 0;
}

function showMessage(message) {
  window.clearTimeout(state.messageTimer);
  messageElement.textContent = message;
  messageElement.hidden = false;
  state.messageTimer = window.setTimeout(() => {
    messageElement.hidden = true;
  }, 4500);
}

async function loadCollapsedState() {
  try {
    const stored = await browser.storage.local.get(COLLAPSED_STORAGE_KEY);
    const byWindow = stored[COLLAPSED_STORAGE_KEY] ?? {};
    const ids = byWindow[String(state.windowId)] ?? [];
    state.collapsed = new Set(ids.map(Number).filter(Number.isInteger));
  } catch (error) {
    console.warn("Tree Tabs could not load collapsed state.", error);
  }
}

function saveCollapsedState() {
  window.clearTimeout(state.storageTimer);
  state.storageTimer = window.setTimeout(async () => {
    try {
      const stored = await browser.storage.local.get(COLLAPSED_STORAGE_KEY);
      const byWindow = stored[COLLAPSED_STORAGE_KEY] ?? {};
      byWindow[String(state.windowId)] = [...state.collapsed];
      await browser.storage.local.set({ [COLLAPSED_STORAGE_KEY]: byWindow });
    } catch (error) {
      console.warn("Tree Tabs could not save collapsed state.", error);
    }
  }, 100);
}

async function refresh() {
  const serial = ++state.refreshSerial;
  try {
    const [tabs, groups] = await Promise.all([
      browser.tabs.query({ windowId: state.windowId }).then(enrichTabsWithTreeState),
      getWindowTreeGroups(state.windowId),
    ]);
    if (serial !== state.refreshSerial) {
      return;
    }
    state.tabs = tabs.sort((left, right) => left.index - right.index);
    state.groups = groups;
    const tabIds = new Set(state.tabs.map((tab) => tab.id));
    state.collapsed = new Set([...state.collapsed].filter((id) => tabIds.has(id)));
    render();
  } catch (error) {
    showMessage("The tab list is temporarily unavailable.");
    console.warn("Tree Tabs could not refresh.", error);
  }
}

function scheduleRefresh() {
  window.clearTimeout(state.refreshTimer);
  state.refreshTimer = window.setTimeout(() => {
    void refresh();
  }, 45);
}

async function createTab(parent = null) {
  const createProperties = {
    windowId: state.windowId,
    active: true,
  };
  if (parent?.id) {
    createProperties.openerTabId = parent.id;
  }

  try {
    await browser.tabs.create(createProperties);
  } catch (error) {
    showMessage("Firefox could not create that tab.");
    console.warn("Tree Tabs could not create a tab.", error);
  }
}

async function closeSelectedTree(tabId) {
  try {
    await browser.runtime.sendMessage({ type: "close-tree", tabId });
  } catch (error) {
    // A sidebar can outlive the background page while an extension is being
    // reloaded. Refreshing gives the user an immediate, harmless recovery.
    showMessage("Firefox could not close that tree yet.");
    console.warn("Tree Tabs could not close a tree.", error);
    scheduleRefresh();
  }
}

async function moveSelectedTree(tabId, destination) {
  try {
    await browser.runtime.sendMessage({ tabId, ...destination });
    if (destination.type === "move-tree" && destination.parentId !== null) {
      state.collapsed.delete(destination.parentId);
    }
    await refresh();
  } catch (error) {
    showMessage(error?.message || "Firefox could not move that subtree.");
    console.warn("Tree Tabs could not move a subtree.", error);
    scheduleRefresh();
  }
}

function showGroupError(message) {
  groupErrorElement.textContent = message;
  groupErrorElement.hidden = !message;
}

function openGroupDialog(groupId = null) {
  const roots = buildTree(state.tabs);
  const group = state.groups.find((item) => item.id === groupId) ?? null;

  groupIdElement.value = group?.id ?? "";
  groupNameElement.value = group?.name ?? "";
  groupColorElement.value = group?.color ?? "#176b87";
  groupTreeOptionsElement.replaceChildren();
  showGroupError("");

  if (roots.length === 0) {
    const empty = document.createElement("p");
    empty.className = "group-tree-empty";
    empty.textContent = "Create top-level trees before making a group.";
    groupTreeOptionsElement.append(empty);
  } else {
    for (const root of roots) {
      const option = document.createElement("label");
      option.className = "group-tree-option";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.name = "group-tree";
      checkbox.value = String(root.tab.id);
      checkbox.checked = root.tab.treeGroupId === group?.id;

      const label = document.createElement("span");
      label.textContent = tabTitle(root.tab);
      option.append(checkbox, label);
      groupTreeOptionsElement.append(option);
    }
  }

  document.getElementById("group-dialog-title").textContent = group
    ? "Edit sub-forest"
    : "Create a sub-forest";
  groupDialogElement.showModal();
  groupNameElement.focus();
}

async function saveGroup(event) {
  event.preventDefault();
  const name = groupNameElement.value.trim();
  const selectedIds = new Set(
    [...groupTreeOptionsElement.querySelectorAll('input[name="group-tree"]:checked')]
      .map((checkbox) => Number(checkbox.value))
      .filter(Number.isInteger),
  );

  if (!name) {
    showGroupError("Give this group a name.");
    return;
  }
  if (selectedIds.size < 2) {
    showGroupError("Select at least two top-level trees.");
    return;
  }

  const existingId = groupIdElement.value;
  const groupId = existingId || crypto.randomUUID();
  const roots = buildTree(state.tabs);
  const membershipChanges = [];
  for (const root of roots) {
    if (selectedIds.has(root.tab.id)) {
      membershipChanges.push(setTabTreeGroup(root.tab.id, groupId));
    } else if (root.tab.treeGroupId === groupId) {
      membershipChanges.push(setTabTreeGroup(root.tab.id, null));
    }
  }

  const group = { id: groupId, name, color: groupColorElement.value };
  const groups = existingId
    ? state.groups.map((item) => (item.id === groupId ? group : item))
    : [...state.groups, group];

  try {
    await Promise.all(membershipChanges);
    state.groups = await setWindowTreeGroups(state.windowId, groups);
    groupDialogElement.close();
    await refresh();
  } catch (error) {
    showGroupError("Firefox could not save this group.");
    console.warn("Tree Tabs could not save a group.", error);
  }
}

async function removeGroup(groupId) {
  const group = state.groups.find((item) => item.id === groupId);
  if (!group || !window.confirm(`Remove “${group.name}”? Its trees will stay open.`)) {
    return;
  }

  try {
    const groupedTabs = state.tabs.filter((tab) => tab.treeGroupId === groupId);
    await Promise.all(groupedTabs.map((tab) => setTabTreeGroup(tab.id, null)));
    state.groups = await setWindowTreeGroups(
      state.windowId,
      state.groups.filter((item) => item.id !== groupId),
    );
    render();
  } catch (error) {
    showMessage("Firefox could not remove that group.");
    console.warn("Tree Tabs could not remove a group.", error);
  }
}

function handleGroupActionClick(event) {
  const action = event.target instanceof Element
    ? event.target.closest("[data-group-action]")
    : null;
  const groupId = action?.closest(".forest-group")?.dataset.groupId;
  if (!action || !groupId) {
    return;
  }

  event.stopPropagation();
  if (action.dataset.groupAction === "edit") {
    openGroupDialog(groupId);
  } else if (action.dataset.groupAction === "remove") {
    void removeGroup(groupId);
  }
}

function setCollapsed(tabId, collapsed) {
  if (collapsed) {
    state.collapsed.add(tabId);
  } else {
    state.collapsed.delete(tabId);
  }
  saveCollapsedState();
  render();
}

async function activateTab(tabId) {
  state.tabs = state.tabs.map((tab) => ({ ...tab, active: tab.id === tabId }));
  render();
  try {
    await browser.tabs.update(tabId, { active: true });
  } catch (error) {
    console.warn("Tree Tabs could not activate a tab.", error);
    scheduleRefresh();
  }
}

function rowFromTarget(target) {
  return target instanceof Element ? target.closest(".tab-row") : null;
}

async function handleTreeClick(event) {
  const actionTarget = event.target instanceof Element
    ? event.target.closest("[data-action]")
    : null;
  const row = rowFromTarget(event.target);
  const tabId = tabIdFromRow(row);
  if (!actionTarget || tabId === null) {
    return;
  }

  const action = actionTarget.dataset.action;
  if (action === "toggle") {
    event.stopPropagation();
    setCollapsed(tabId, !state.collapsed.has(tabId));
    return;
  }

  if (action === "close") {
    event.stopPropagation();
    await closeSelectedTree(tabId);
    return;
  }

  if (action === "activate") {
    await activateTab(tabId);
  }
}

function draggedSubtreeIds() {
  return new Set(collectSubtreeIds(state.tabs, state.draggedTabId));
}

function clearDragPresentation() {
  treeElement.querySelectorAll(
    ".is-dragging, .is-drop-target, .is-drop-before, .is-drop-after",
  ).forEach((element) => {
    element.classList.remove(
      "is-dragging",
      "is-drop-target",
      "is-drop-before",
      "is-drop-after",
    );
    delete element.dataset.dropPlacement;
  });
  rootDropElement.classList.remove("is-drop-target");
  rootDropElement.hidden = true;
  document.body.classList.remove("is-dragging");
}

function finishDrag() {
  clearDragPresentation();
  state.draggedTabId = null;
}

function handleTreeDragStart(event) {
  const handle = event.target instanceof Element
    ? event.target.closest(".drag-handle")
    : null;
  const row = rowFromTarget(handle);
  const tabId = tabIdFromRow(row);
  if (!handle || tabId === null || !event.dataTransfer) {
    event.preventDefault();
    return;
  }

  state.draggedTabId = tabId;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", String(tabId));
  row.classList.add("is-dragging");
  rootDropElement.hidden = false;
  document.body.classList.add("is-dragging");
}

function handleTreeDragOver(event) {
  const row = rowFromTarget(event.target);
  const targetId = tabIdFromRow(row);
  if (state.draggedTabId === null
      || targetId === null
      || draggedSubtreeIds().has(targetId)) {
    return;
  }

  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "move";
  }
  treeElement.querySelectorAll(".is-drop-target, .is-drop-before, .is-drop-after")
    .forEach((element) => {
      element.classList.remove("is-drop-target", "is-drop-before", "is-drop-after");
      delete element.dataset.dropPlacement;
    });

  const bounds = row.getBoundingClientRect();
  const offset = event.clientY - bounds.top;
  const edgeSize = Math.min(10, bounds.height * 0.3);
  const placement = offset < edgeSize
    ? "before"
    : offset > bounds.height - edgeSize
      ? "after"
      : "child";
  row.dataset.dropPlacement = placement;
  if (placement === "before") {
    row.classList.add("is-drop-before");
  } else if (placement === "after") {
    row.classList.add("is-drop-after");
  } else {
    row.classList.add("is-drop-target");
  }
}

function handleTreeDrop(event) {
  const row = rowFromTarget(event.target);
  const targetId = tabIdFromRow(row);
  const tabId = state.draggedTabId;
  if (tabId === null || targetId === null || draggedSubtreeIds().has(targetId)) {
    return;
  }

  event.preventDefault();
  const placement = row.dataset.dropPlacement ?? "child";
  finishDrag();
  if (placement === "before" || placement === "after") {
    void moveSelectedTree(tabId, {
      type: "reorder-tree",
      targetId,
      placement,
    });
  } else {
    void moveSelectedTree(tabId, { type: "move-tree", parentId: targetId });
  }
}

function handleRootDragOver(event) {
  if (state.draggedTabId === null) {
    return;
  }
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "move";
  }
  rootDropElement.classList.add("is-drop-target");
}

function handleRootDrop(event) {
  const tabId = state.draggedTabId;
  if (tabId === null) {
    return;
  }
  event.preventDefault();
  finishDrag();
  void moveSelectedTree(tabId, { type: "move-tree", parentId: null });
}

function handleTreeAuxClick(event) {
  if (event.button !== 1 || !(event.target instanceof Element)) {
    return;
  }
  const tabButton = event.target.closest(".tab-button");
  const tabId = tabIdFromRow(rowFromTarget(tabButton));
  if (!tabButton || tabId === null) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  void closeSelectedTree(tabId);
}

function moveFocus(delta) {
  const buttons = [...treeElement.querySelectorAll(".tab-button")];
  if (buttons.length === 0) {
    return;
  }
  const current = document.activeElement;
  const currentIndex = buttons.indexOf(current);
  const nextIndex = currentIndex < 0
    ? 0
    : (currentIndex + delta + buttons.length) % buttons.length;
  buttons[nextIndex].focus();
}

function handleKeyboard(event) {
  if (groupDialogElement.open) {
    return;
  }
  if (event.key === "ArrowDown") {
    event.preventDefault();
    moveFocus(1);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    moveFocus(-1);
  } else if (event.key === "Delete" && document.activeElement?.dataset?.action === "activate") {
    const row = rowFromTarget(document.activeElement);
    const tabId = tabIdFromRow(row);
    if (tabId !== null) {
      event.preventDefault();
      void closeSelectedTree(tabId);
    }
  }
}

function attachBrowserListeners() {
  browser.tabs.onCreated.addListener((tab) => {
    if (tab.windowId === state.windowId) {
      scheduleRefresh();
    }
  });
  browser.tabs.onUpdated.addListener((tabId, _changeInfo, tab) => {
    if (tab.windowId === state.windowId || state.tabs.some((item) => item.id === tabId)) {
      scheduleRefresh();
    }
  });
  browser.tabs.onMoved.addListener((_tabId, moveInfo) => {
    if (moveInfo.windowId === state.windowId) {
      scheduleRefresh();
    }
  });
  browser.tabs.onAttached.addListener((_tabId, attachInfo) => {
    if (attachInfo.newWindowId === state.windowId) {
      scheduleRefresh();
    }
  });
  browser.tabs.onDetached.addListener((_tabId, detachInfo) => {
    if (detachInfo.oldWindowId === state.windowId) {
      scheduleRefresh();
    }
  });
  browser.tabs.onRemoved.addListener((_tabId, removeInfo) => {
    if (removeInfo.windowId === state.windowId) {
      scheduleRefresh();
    }
  });
  browser.tabs.onActivated.addListener((activeInfo) => {
    if (activeInfo.windowId === state.windowId) {
      scheduleRefresh();
    }
  });
  browser.tabs.onReplaced.addListener((_addedTabId, _removedTabId) => {
    scheduleRefresh();
  });
}

document.getElementById("new-root").addEventListener("click", () => {
  void createTab();
});

document.getElementById("new-child").addEventListener("click", () => {
  void createTab(selectedTab());
});

document.getElementById("new-group").addEventListener("click", () => {
  openGroupDialog();
});

document.getElementById("empty-new-root").addEventListener("click", () => {
  void createTab();
});

document.getElementById("refresh").addEventListener("click", () => {
  void refresh();
});

function setAllCollapsed(collapsed) {
  state.collapsed = collapsed
    ? new Set(allBranchIds(buildTree(state.tabs)))
    : new Set();
  saveCollapsedState();
  render();
}

document.getElementById("collapse-all").addEventListener("click", () => {
  setAllCollapsed(true);
});

document.getElementById("expand-all").addEventListener("click", () => {
  setAllCollapsed(false);
});

treeElement.addEventListener("click", (event) => {
  handleGroupActionClick(event);
  void handleTreeClick(event);
});
treeElement.addEventListener("auxclick", handleTreeAuxClick);
treeElement.addEventListener("dragstart", handleTreeDragStart);
treeElement.addEventListener("dragover", handleTreeDragOver);
treeElement.addEventListener("drop", handleTreeDrop);
treeElement.addEventListener("dragend", finishDrag);
rootDropElement.addEventListener("dragover", handleRootDragOver);
rootDropElement.addEventListener("dragleave", () => {
  rootDropElement.classList.remove("is-drop-target");
});
rootDropElement.addEventListener("drop", handleRootDrop);
groupFormElement.addEventListener("submit", (event) => {
  void saveGroup(event);
});
document.getElementById("group-cancel").addEventListener("click", () => {
  groupDialogElement.close();
});
document.getElementById("group-cancel-icon").addEventListener("click", () => {
  groupDialogElement.close();
});
document.addEventListener("keydown", handleKeyboard);

async function initialize() {
  try {
    const currentWindow = await browser.windows.getCurrent();
    state.windowId = currentWindow.id;
    windowLabelElement.textContent = currentWindow.title || "Current window";
    await loadCollapsedState();
    attachBrowserListeners();
    await refresh();
  } catch (error) {
    showMessage("Tree Tabs could not start in this window.");
    console.warn("Tree Tabs initialization failed.", error);
  }
}

void initialize();
