import assert from "node:assert/strict";
import test from "node:test";

const values = new Map();
globalThis.browser = {
  sessions: {
    async getTabValue(tabId, key) {
      return values.get(`${tabId}:${key}`);
    },
    async setTabValue(tabId, key, value) {
      values.set(`${tabId}:${key}`, value);
    },
  },
};

const { enrichTabsWithTreeState, setTabTreeParent } = await import("../tree-state.mjs");

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
