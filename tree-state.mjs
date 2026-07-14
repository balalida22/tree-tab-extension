const NODE_ID_KEY = "treeTabsNodeId";
const PARENT_NODE_ID_KEY = "treeTabsParentNodeId";
const ROOT_PARENT = "__tree_tabs_root__";

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

  return tabs.map((tab, index) => {
    const enriched = { ...tab, treeNodeId: nodeIds[index] };
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
