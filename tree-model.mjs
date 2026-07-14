function tabIndex(tab) {
  return Number.isInteger(tab.index) ? tab.index : Number.MAX_SAFE_INTEGER;
}

function compareTabs(left, right) {
  return tabIndex(left) - tabIndex(right) || left.id - right.id;
}

function hasParentInWindow(tab, parent, byId) {
  return byId.has(parent) && byId.get(parent).windowId === tab.windowId;
}

/**
 * Return a tab's valid opener in the same window, or null when it is a root.
 */
export function getParentId(tab, byId) {
  const parent = tab.openerTabId;
  if (!Number.isInteger(parent) || parent === tab.id) {
    return null;
  }
  return hasParentInWindow(tab, parent, byId) ? parent : null;
}

function wouldCreateCycle(tabId, parentId, parentIds) {
  const seen = new Set([tabId]);
  let current = parentId;

  while (current !== null && current !== undefined) {
    if (seen.has(current)) {
      return true;
    }
    seen.add(current);
    current = parentIds.get(current) ?? null;
  }

  return false;
}

/**
 * Convert Firefox's flat tab list into an index-ordered forest.
 *
 * Nodes contain the original tab object, a parentId, and a children array.
 * Invalid, cross-window, and cyclic opener relationships become roots so a
 * malformed browser event can never make the sidebar disappear.
 */
export function buildTree(tabs) {
  const orderedTabs = [...tabs].sort(compareTabs);
  const byId = new Map(orderedTabs.map((tab) => [tab.id, tab]));
  const parentIds = new Map();
  const nodes = new Map();

  for (const tab of orderedTabs) {
    parentIds.set(tab.id, getParentId(tab, byId));
    nodes.set(tab.id, {
      tab,
      parentId: null,
      children: [],
    });
  }

  const roots = [];
  for (const tab of orderedTabs) {
    const node = nodes.get(tab.id);
    const proposedParent = parentIds.get(tab.id);
    const parentId = proposedParent !== null && !wouldCreateCycle(tab.id, proposedParent, parentIds)
      ? proposedParent
      : null;

    node.parentId = parentId;
    if (parentId === null) {
      roots.push(node);
    } else {
      nodes.get(parentId).children.push(node);
    }
  }

  return roots;
}

/**
 * Return the root tab and all descendants in display order.
 */
export function collectSubtreeIds(tabs, rootId) {
  const byId = new Map(tabs.map((tab) => [tab.id, tab]));
  if (!byId.has(rootId)) {
    return [];
  }

  const childrenByParent = new Map();
  for (const tab of tabs) {
    const parentId = getParentId(tab, byId);
    if (parentId === null) {
      continue;
    }
    const children = childrenByParent.get(parentId) ?? [];
    children.push(tab);
    childrenByParent.set(parentId, children);
  }

  for (const children of childrenByParent.values()) {
    children.sort(compareTabs);
  }

  const result = [];
  const pending = [rootId];
  while (pending.length > 0) {
    const tabId = pending.pop();
    result.push(tabId);
    const children = childrenByParent.get(tabId) ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      pending.push(children[index].id);
    }
  }
  return result;
}
