import {
  collectSubtreeIds,
  planSubtreeMove,
  planSubtreeReorder,
} from "./tree-model.mjs";
import {
  enrichTabsWithTreeState,
  setTabTreeGroup,
  setTabTreeParent,
} from "./tree-state.mjs";

const CHILD_LINK_MENU_ID = "open-link-in-child-tab";
const snapshots = new Map();
const closingTabIds = new Set();
const initialSnapshot = loadSnapshots();
let contextMenuSetup = Promise.resolve();

async function loadSnapshots() {
  try {
    const tabs = await enrichTabsWithTreeState(await browser.tabs.query({}));
    for (const tab of tabs) {
      rememberTab(tab);
    }
  } catch (error) {
    console.warn("Tree Tabs could not load the initial tab snapshot.", error);
  }
}

function rememberTab(tab) {
  if (!Number.isInteger(tab.windowId) || !Number.isInteger(tab.id)) {
    return;
  }
  const windowTabs = snapshots.get(tab.windowId) ?? new Map();
  windowTabs.set(tab.id, { ...windowTabs.get(tab.id), ...tab });
  snapshots.set(tab.windowId, windowTabs);
}

function forgetTab(windowId, tabId) {
  const windowTabs = snapshots.get(windowId);
  if (!windowTabs) {
    return;
  }
  windowTabs.delete(tabId);
  if (windowTabs.size === 0) {
    snapshots.delete(windowId);
  }
}

async function getWindowTabs(windowId) {
  const tabs = await enrichTabsWithTreeState(await browser.tabs.query({ windowId }));
  const windowTabs = new Map(tabs.map((tab) => [tab.id, tab]));
  snapshots.set(windowId, windowTabs);
  return tabs;
}

async function moveTree(tabId, destination) {
  const tab = await browser.tabs.get(tabId);
  const tabs = await getWindowTabs(tab.windowId);
  const isReorder = Number.isInteger(destination.targetId)
    && (destination.placement === "before" || destination.placement === "after");
  const plan = isReorder
    ? planSubtreeReorder(tabs, tabId, destination.targetId, destination.placement)
    : planSubtreeMove(tabs, tabId, destination.parentId);

  await setTabTreeParent(tabId, plan.parentId);
  if (plan.parentId !== null) {
    await setTabTreeGroup(tabId, null);
  } else if (isReorder) {
    const target = tabs.find((item) => item.id === destination.targetId);
    await setTabTreeGroup(tabId, target?.treeGroupId ?? null);
  }
  const moved = await browser.tabs.move(plan.tabIds, {
    windowId: tab.windowId,
    index: plan.index,
  });
  const movedTabs = Array.isArray(moved) ? moved : [moved];
  if (movedTabs.filter(Boolean).length !== plan.tabIds.length) {
    throw new Error("Firefox could not move every tab in that subtree.");
  }

  await getWindowTabs(tab.windowId);
}

async function closeTree(tabId, windowId) {
  const tabs = await getWindowTabs(windowId);
  const ids = collectSubtreeIds(tabs, tabId);
  if (ids.length === 0) {
    return;
  }

  // Keep Firefox's window alive if the user closes the only tree in it.
  if (ids.length === tabs.length) {
    await browser.tabs.create({ windowId, active: true });
  }

  for (const id of ids) {
    closingTabIds.add(id);
  }

  try {
    await browser.tabs.remove(ids);
  } catch (error) {
    console.warn("Tree Tabs could not close the selected tree.", error);
  } finally {
    // onRemoved normally clears these entries; this also handles a tab that
    // Firefox removed before the extension got its event.
    setTimeout(() => {
      for (const id of ids) {
        closingTabIds.delete(id);
      }
    }, 5000);
  }
}

async function setupContextMenu() {
  try {
    await browser.contextMenus.removeAll();
    await browser.contextMenus.create({
      id: CHILD_LINK_MENU_ID,
      title: "Open link in child tab",
      contexts: ["link"],
    });
  } catch (error) {
    console.warn("Tree Tabs could not create its link menu.", error);
  }
}

function scheduleContextMenuSetup() {
  contextMenuSetup = contextMenuSetup.then(() => setupContextMenu());
  void contextMenuSetup;
}

async function activeTabInLastFocusedWindow() {
  const activeTabs = await browser.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  return activeTabs[0] ?? null;
}

browser.runtime.onInstalled.addListener(() => {
  scheduleContextMenuSetup();
});

browser.runtime.onStartup.addListener(() => {
  scheduleContextMenuSetup();
});

// This also makes a temporary extension reload recreate the menu immediately.
scheduleContextMenuSetup();

browser.action.onClicked.addListener(() => {
  void browser.sidebarAction.toggle();
});

browser.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== CHILD_LINK_MENU_ID || !info.linkUrl || !tab?.id) {
    return;
  }

  void browser.tabs.create({
    windowId: tab.windowId,
    openerTabId: tab.id,
    url: info.linkUrl,
    active: true,
  }).catch((error) => {
    console.warn("Tree Tabs could not open the link as a child tab.", error);
  });
});

browser.runtime.onMessage.addListener((message) => {
  if (!Number.isInteger(message?.tabId)) {
    return undefined;
  }

  if (message.type === "close-tree") {
    return browser.tabs.get(message.tabId).then((tab) => closeTree(tab.id, tab.windowId));
  }

  if (message.type === "move-tree"
      && (message.parentId === null || Number.isInteger(message.parentId))) {
    return moveTree(message.tabId, { parentId: message.parentId });
  }

  if (message.type === "reorder-tree"
      && Number.isInteger(message.targetId)
      && (message.placement === "before" || message.placement === "after")) {
    return moveTree(message.tabId, {
      targetId: message.targetId,
      placement: message.placement,
    });
  }

  return undefined;
});

browser.commands.onCommand.addListener((command) => {
  void (async () => {
    const activeTab = await activeTabInLastFocusedWindow();

    if (command === "new-top-level-tab") {
      await browser.tabs.create(activeTab ? { windowId: activeTab.windowId } : {});
      return;
    }

    if (command === "new-child-tab") {
      if (activeTab?.id) {
        await browser.tabs.create({
          windowId: activeTab.windowId,
          openerTabId: activeTab.id,
        });
      } else {
        await browser.tabs.create({});
      }
      return;
    }

    if (command === "close-tree" && activeTab?.id) {
      await closeTree(activeTab.id, activeTab.windowId);
    }
  })().catch((error) => {
    console.warn("Tree Tabs command failed.", error);
  });
});

browser.tabs.onCreated.addListener((tab) => {
  void initialSnapshot.then(() => rememberTab(tab));
});

browser.tabs.onUpdated.addListener((tabId, _changeInfo, tab) => {
  void initialSnapshot.then(() => rememberTab(tab));
});

browser.tabs.onMoved.addListener((tabId, moveInfo) => {
  void initialSnapshot.then(() => {
    const windowTabs = snapshots.get(moveInfo.windowId);
    const tab = windowTabs?.get(tabId);
    if (tab) {
      tab.index = moveInfo.toIndex;
    }
  });
});

browser.tabs.onAttached.addListener((tabId, attachInfo) => {
  void initialSnapshot.then(async () => {
    try {
      const tab = await browser.tabs.get(tabId);
      rememberTab(tab);
      await getWindowTabs(attachInfo.newWindowId);
    } catch (error) {
      console.warn("Tree Tabs could not refresh an attached tab.", error);
    }
  });
});

browser.tabs.onDetached.addListener((tabId, detachInfo) => {
  void initialSnapshot.then(() => forgetTab(detachInfo.oldWindowId, tabId));
});

browser.tabs.onRemoved.addListener((tabId, removeInfo) => {
  void initialSnapshot.then(async () => {
    const windowTabs = snapshots.get(removeInfo.windowId);
    const previousTabs = windowTabs ? [...windowTabs.values()] : [];
    forgetTab(removeInfo.windowId, tabId);

    if (closingTabIds.has(tabId) || removeInfo.isWindowClosing) {
      closingTabIds.delete(tabId);
      return;
    }

    const descendants = collectSubtreeIds(previousTabs, tabId).filter((id) => id !== tabId);
    for (const descendantId of descendants) {
      closingTabIds.add(descendantId);
    }

    if (descendants.length > 0) {
      try {
        const currentTabs = await getWindowTabs(removeInfo.windowId);
        const currentIds = new Set(currentTabs.map((tab) => tab.id));
        const existingDescendants = descendants.filter((id) => currentIds.has(id));
        if (existingDescendants.length === currentTabs.length) {
          await browser.tabs.create({ windowId: removeInfo.windowId, active: true });
        }
        if (existingDescendants.length > 0) {
          await browser.tabs.remove(existingDescendants);
        }
      } catch (error) {
        console.warn("Tree Tabs could not close orphaned child tabs.", error);
      }
    }
  });
});

browser.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
  void initialSnapshot.then(async () => {
    try {
      const tab = await browser.tabs.get(addedTabId);
      forgetTab(tab.windowId, removedTabId);
      await getWindowTabs(tab.windowId);
    } catch (error) {
      console.warn("Tree Tabs could not refresh a replaced tab.", error);
    }
  });
});
