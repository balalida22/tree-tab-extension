import { buildTree, collectSubtreeIds } from "./tree-model.mjs";

const COLLAPSED_STORAGE_KEY = "collapsedByWindow";

const state = {
  windowId: null,
  tabs: [],
  collapsed: new Set(),
  refreshSerial: 0,
  refreshTimer: null,
  storageTimer: null,
  messageTimer: null,
};

const treeElement = document.getElementById("tree");
const emptyStateElement = document.getElementById("empty-state");
const tabCountElement = document.getElementById("tab-count");
const windowLabelElement = document.getElementById("window-label");
const messageElement = document.getElementById("message");

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
  tabButton.title = `${tabTitle(tab)}\n${tab.url ?? ""}`;
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

function render() {
  const roots = buildTree(state.tabs);
  treeElement.replaceChildren();

  const list = document.createElement("ul");
  list.className = "tree-list";
  list.setAttribute("role", "group");
  for (const root of roots) {
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
    const tabs = await browser.tabs.query({ windowId: state.windowId });
    if (serial !== state.refreshSerial) {
      return;
    }
    state.tabs = tabs.sort((left, right) => left.index - right.index);
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
  void handleTreeClick(event);
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
