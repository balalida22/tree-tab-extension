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
  const parent = Object.hasOwn(tab, "treeParentId")
    ? tab.treeParentId
    : tab.openerTabId;
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
  const visited = new Set();
  while (pending.length > 0) {
    const tabId = pending.pop();
    if (visited.has(tabId)) {
      continue;
    }
    visited.add(tabId);
    result.push(tabId);
    const children = childrenByParent.get(tabId) ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      pending.push(children[index].id);
    }
  }
  return result;
}

/**
 * Plan a whole-subtree move in Firefox's flat tab strip.
 *
 * A null parent makes the subtree a root. Otherwise, the subtree becomes the
 * target's first child. Moving a mixed pinned/unpinned subtree, or nesting
 * across the pinned boundary, is not supported by Firefox's tabs.move API.
 */
export function planSubtreeMove(tabs, rootId, parentId) {
  const byId = new Map(tabs.map((tab) => [tab.id, tab]));
  const root = byId.get(rootId);
  if (!root) {
    throw new Error("The dragged tab is no longer available.");
  }

  const tabIds = collectSubtreeIds(tabs, rootId);
  const subtreeIds = new Set(tabIds);
  const subtreeTabs = tabIds.map((tabId) => byId.get(tabId));
  if (subtreeTabs.some((tab) => tab.pinned !== root.pinned)) {
    throw new Error("A subtree cannot mix pinned and unpinned tabs while moving.");
  }

  if (parentId === null) {
    const pinnedCount = tabs.filter((tab) => tab.pinned).length;
    return {
      tabIds,
      parentId: null,
      index: root.pinned ? pinnedCount - tabIds.length : -1,
    };
  }

  const parent = byId.get(parentId);
  if (!parent) {
    throw new Error("The destination tab is no longer available.");
  }
  if (subtreeIds.has(parentId)) {
    throw new Error("A subtree cannot be moved into itself.");
  }
  if (parent.pinned !== root.pinned) {
    throw new Error("Pinned and unpinned tabs cannot share a subtree.");
  }

  const removedBeforeParent = subtreeTabs.filter((tab) => tab.index < parent.index).length;
  return {
    tabIds,
    parentId,
    index: parent.index + 1 - removedBeforeParent,
  };
}

/**
 * Plan a whole-subtree move immediately before or after another tree.
 *
 * The moved root becomes a sibling of the target. "After" means after the
 * target's complete subtree, so descendants always remain contiguous.
 */
export function planSubtreeReorder(tabs, rootId, targetId, placement) {
  if (placement !== "before" && placement !== "after") {
    throw new Error("A reordered subtree must be placed before or after its target.");
  }

  const byId = new Map(tabs.map((tab) => [tab.id, tab]));
  const root = byId.get(rootId);
  const target = byId.get(targetId);
  if (!root) {
    throw new Error("The dragged tab is no longer available.");
  }
  if (!target) {
    throw new Error("The destination tab is no longer available.");
  }

  const tabIds = collectSubtreeIds(tabs, rootId);
  const subtreeIds = new Set(tabIds);
  if (subtreeIds.has(targetId)) {
    throw new Error("A subtree cannot be reordered relative to itself.");
  }

  const subtreeTabs = tabIds.map((tabId) => byId.get(tabId));
  if (subtreeTabs.some((tab) => tab.pinned !== root.pinned)
      || target.pinned !== root.pinned) {
    throw new Error("Pinned and unpinned tabs cannot be reordered together.");
  }

  const targetSubtree = collectSubtreeIds(tabs, targetId).map((tabId) => byId.get(tabId));
  const rawIndex = placement === "before"
    ? target.index
    : Math.max(...targetSubtree.map((tab) => tab.index)) + 1;
  const removedBeforeIndex = subtreeTabs.filter((tab) => tab.index < rawIndex).length;

  return {
    tabIds,
    parentId: getParentId(target, byId),
    targetId,
    placement,
    index: rawIndex - removedBeforeIndex,
  };
}
