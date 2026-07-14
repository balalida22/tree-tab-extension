import assert from "node:assert/strict";
import test from "node:test";

import { buildTree, collectSubtreeIds, planSubtreeMove } from "../tree-model.mjs";

function tab(id, index, openerTabId, windowId = 1) {
  return { id, index, openerTabId, windowId };
}

test("buildTree nests same-window opener tabs in tab order", () => {
  const roots = buildTree([
    tab(3, 2, 1),
    tab(1, 0),
    tab(4, 3, 3),
    tab(2, 1, 1),
  ]);

  assert.deepEqual(roots.map((node) => node.tab.id), [1]);
  assert.deepEqual(roots[0].children.map((node) => node.tab.id), [2, 3]);
  assert.deepEqual(roots[0].children[1].children.map((node) => node.tab.id), [4]);
});

test("cross-window and missing openers become roots", () => {
  const roots = buildTree([
    tab(1, 0),
    tab(2, 1, 999),
    tab(3, 2, 1, 2),
  ]);

  assert.deepEqual(roots.map((node) => node.tab.id), [1, 2, 3]);
});

test("cyclic opener data cannot make a recursive tree", () => {
  const roots = buildTree([
    tab(1, 0, 2),
    tab(2, 1, 1),
  ]);

  assert.equal(roots.length, 2);
  assert.deepEqual(roots.map((node) => node.tab.id), [1, 2]);
});

test("collectSubtreeIds returns a root followed by all descendants", () => {
  const tabs = [
    tab(1, 0),
    tab(2, 1, 1),
    tab(3, 2),
    tab(4, 3, 2),
    tab(5, 4, 1),
  ];

  assert.deepEqual(collectSubtreeIds(tabs, 1), [1, 2, 4, 5]);
  assert.deepEqual(collectSubtreeIds(tabs, 3), [3]);
  assert.deepEqual(collectSubtreeIds(tabs, 404), []);
});

test("explicit tree parents override openers and can promote a tab to a root", () => {
  const roots = buildTree([
    tab(1, 0),
    { ...tab(2, 1, 1), treeParentId: null },
    { ...tab(3, 2), treeParentId: 2 },
  ]);

  assert.deepEqual(roots.map((node) => node.tab.id), [1, 2]);
  assert.deepEqual(roots[1].children.map((node) => node.tab.id), [3]);
});

test("planSubtreeMove groups descendants beneath a new parent", () => {
  const tabs = [
    tab(1, 0),
    tab(2, 1, 1),
    tab(3, 2),
    tab(4, 3, 2),
  ];

  assert.deepEqual(planSubtreeMove(tabs, 2, 3), {
    tabIds: [2, 4],
    parentId: 3,
    index: 2,
  });
});

test("planSubtreeMove can promote a subtree and rejects descendant targets", () => {
  const tabs = [
    tab(1, 0),
    tab(2, 1, 1),
    tab(3, 2, 2),
  ];

  assert.deepEqual(planSubtreeMove(tabs, 2, null), {
    tabIds: [2, 3],
    parentId: null,
    index: -1,
  });
  assert.throws(() => planSubtreeMove(tabs, 2, 3), /cannot be moved into itself/);
});

test("planSubtreeMove keeps pinned subtrees inside the pinned region", () => {
  const tabs = [
    { ...tab(1, 0), pinned: true },
    { ...tab(2, 1, 1), pinned: true },
    tab(3, 2),
  ];

  assert.deepEqual(planSubtreeMove(tabs, 1, null), {
    tabIds: [1, 2],
    parentId: null,
    index: 0,
  });
  assert.throws(() => planSubtreeMove(tabs, 2, 3), /Pinned and unpinned/);
});
