const NODE_ID_KEY = "treeTabsNodeId";
const PARENT_NODE_ID_KEY = "treeTabsParentNodeId";
const GROUP_ID_KEY = "treeTabsGroupId";
const GROUPS_KEY = "treeTabsGroups";
const ROOT_PARENT = "__tree_tabs_root__";
const DEFAULT_GROUP_COLOR = "#176b87";

async function ensureNodeId(tabId) {
  let nodeId = await browser.sessions.getTabValue(tabId, NODE_ID_KEY);
  if (typeof nodeId === "string" && nodeId.length > 0) {
    return nodeId;
  }

  nodeId = crypto.randomUUID();
  await browser.sessions.setTabValue(tabId, NODE_ID_KEY, nodeId);
  return nodeId;
}

/**
 * Add stable tree node IDs and resolve any custom parent relationships.
 * Tabs without a custom relationship continue to use Firefox's openerTabId.
 */
export async function enrichTabsWithTreeState(tabs) {
  const nodeIds = await Promise.all(tabs.map((tab) => ensureNodeId(tab.id)));
  const tabIdByNodeId = new Map(nodeIds.map((nodeId, index) => [nodeId, tabs[index].id]));
  const parentNodeIds = await Promise.all(tabs.map((tab) => (
    browser.sessions.getTabValue(tab.id, PARENT_NODE_ID_KEY)
  )));
  const groupIds = await Promise.all(tabs.map((tab) => (
    browser.sessions.getTabValue(tab.id, GROUP_ID_KEY)
  )));

  return tabs.map((tab, index) => {
    const enriched = { ...tab, treeNodeId: nodeIds[index] };
    if (typeof groupIds[index] === "string" && groupIds[index].length > 0) {
      enriched.treeGroupId = groupIds[index];
    }
    const parentNodeId = parentNodeIds[index];
    if (parentNodeId === undefined || parentNodeId === null) {
      return enriched;
    }

    enriched.treeParentId = parentNodeId === ROOT_PARENT
      ? null
      : tabIdByNodeId.get(parentNodeId) ?? null;
    return enriched;
  });
}

/** Persist a custom parent relationship for a tab across browser restarts. */
export async function setTabTreeParent(tabId, parentId) {
  const parentNodeId = parentId === null
    ? ROOT_PARENT
    : await ensureNodeId(parentId);
  await browser.sessions.setTabValue(tabId, PARENT_NODE_ID_KEY, parentNodeId);
}

/** Assign a root tree to a group, or remove its group membership. */
export async function setTabTreeGroup(tabId, groupId) {
  if (groupId === null) {
    await browser.sessions.removeTabValue(tabId, GROUP_ID_KEY);
    return;
  }
  await browser.sessions.setTabValue(tabId, GROUP_ID_KEY, groupId);
}

/** Resolve group membership after nesting, detaching, or sibling reordering. */
export function groupIdForTreeMove(tabs, parentId, targetId = null) {
  if (parentId !== null || !Number.isInteger(targetId)) {
    return null;
  }
  return tabs.find((tab) => tab.id === targetId)?.treeGroupId ?? null;
}

export function sanitizeTreeGroups(groups) {
  if (!Array.isArray(groups)) {
    return [];
  }

  const ids = new Set();
  const result = [];
  for (const group of groups) {
    const id = typeof group?.id === "string" ? group.id.trim() : "";
    const name = typeof group?.name === "string" ? group.name.trim() : "";
    if (!id || !name || ids.has(id)) {
      continue;
    }
    ids.add(id);
    result.push({
      id,
      name: name.slice(0, 40),
      color: /^#[0-9a-f]{6}$/i.test(group.color) ? group.color : DEFAULT_GROUP_COLOR,
    });
  }
  return result;
}

/** Load the named and colored sub-forest definitions for a window. */
export async function getWindowTreeGroups(windowId) {
  return sanitizeTreeGroups(await browser.sessions.getWindowValue(windowId, GROUPS_KEY));
}

/** Persist the named and colored sub-forest definitions for a window. */
export async function setWindowTreeGroups(windowId, groups) {
  const sanitized = sanitizeTreeGroups(groups);
  await browser.sessions.setWindowValue(windowId, GROUPS_KEY, sanitized);
  return sanitized;
}
