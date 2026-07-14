import assert from "node:assert/strict";
import test from "node:test";

const values = new Map();
const windowValues = new Map();
globalThis.browser = {
  sessions: {
    async getTabValue(tabId, key) {
      return values.get(`${tabId}:${key}`);
    },
    async setTabValue(tabId, key, value) {
      values.set(`${tabId}:${key}`, value);
    },
    async removeTabValue(tabId, key) {
      values.delete(`${tabId}:${key}`);
    },
    async getWindowValue(windowId, key) {
      return windowValues.get(`${windowId}:${key}`);
    },
    async setWindowValue(windowId, key, value) {
      windowValues.set(`${windowId}:${key}`, value);
    },
  },
};

const {
  enrichTabsWithTreeState,
  getWindowTreeGroups,
  groupIdForTreeMove,
  sanitizeTreeGroups,
  setTabTreeGroup,
  setTabTreeParent,
  setWindowTreeGroups,
} = await import("../tree-state.mjs");

function tab(id, index, openerTabId) {
  return { id, index, openerTabId, windowId: 1 };
}

test("custom parents resolve through stable session node IDs", async () => {
  const tabs = [tab(1, 0), tab(2, 1, 1)];
  const initial = await enrichTabsWithTreeState(tabs);

  assert.equal(typeof initial[0].treeNodeId, "string");
  assert.equal(Object.hasOwn(initial[1], "treeParentId"), false);

  await setTabTreeParent(2, null);
  const detached = await enrichTabsWithTreeState(tabs);
  assert.equal(detached[1].treeParentId, null);

  await setTabTreeParent(2, 1);
  const nested = await enrichTabsWithTreeState(tabs);
  assert.equal(nested[1].treeParentId, 1);
  assert.equal(nested[0].treeNodeId, initial[0].treeNodeId);
  assert.equal(nested[1].treeNodeId, initial[1].treeNodeId);
});

test("tree groups persist sanitized metadata and per-root membership", async () => {
  const groups = await setWindowTreeGroups(1, [
    { id: "research", name: "  Research  ", color: "#8b5cf6" },
    { id: "invalid-color", name: "Fallback", color: "purple" },
    { id: "research", name: "Duplicate", color: "#000000" },
  ]);

  assert.deepEqual(groups, [
    { id: "research", name: "Research", color: "#8b5cf6" },
    { id: "invalid-color", name: "Fallback", color: "#176b87" },
  ]);
  assert.deepEqual(await getWindowTreeGroups(1), groups);
  assert.deepEqual(sanitizeTreeGroups(null), []);

  await setTabTreeGroup(1, "research");
  let enriched = await enrichTabsWithTreeState([tab(1, 0)]);
  assert.equal(enriched[0].treeGroupId, "research");

  await setTabTreeGroup(1, null);
  enriched = await enrichTabsWithTreeState([tab(1, 0)]);
  assert.equal(Object.hasOwn(enriched[0], "treeGroupId"), false);
  assert.deepEqual(await getWindowTreeGroups(1), groups, "empty groups remain persisted");
});

test("tree moves detach groups or adopt a reordered root's group", () => {
  const tabs = [
    { ...tab(1, 0), treeGroupId: "research" },
    { ...tab(2, 1), treeGroupId: "writing" },
  ];

  assert.equal(groupIdForTreeMove(tabs, null), null, "top-level drop leaves its group");
  assert.equal(groupIdForTreeMove(tabs, 1, 2), null, "nesting leaves its group");
  assert.equal(groupIdForTreeMove(tabs, null, 2), "writing", "root reorder adopts group");
  assert.equal(groupIdForTreeMove(tabs, null, 999), null, "unknown roots are ungrouped");
});
