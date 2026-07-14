import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTree,
  collectSubtreeIds,
  planSubtreeMove,
  planSubtreeReorder,
} from "../tree-model.mjs";

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

test("planSubtreeReorder places whole sibling subtrees before or after a target", () => {
  const tabs = [
    tab(1, 0),
    tab(2, 1, 1),
    tab(3, 2, 2),
    tab(4, 3, 1),
    tab(5, 4, 4),
  ];

  assert.deepEqual(planSubtreeReorder(tabs, 4, 2, "before"), {
    tabIds: [4, 5],
    parentId: 1,
    targetId: 2,
    placement: "before",
    index: 1,
  });
  assert.deepEqual(planSubtreeReorder(tabs, 2, 4, "after"), {
    tabIds: [2, 3],
    parentId: 1,
    targetId: 4,
    placement: "after",
    index: 3,
  });
});

test("planSubtreeReorder can move a tree between parents and rejects invalid targets", () => {
  const tabs = [
    tab(1, 0),
    tab(2, 1, 1),
    tab(3, 2),
    tab(4, 3, 3),
  ];

  assert.deepEqual(planSubtreeReorder(tabs, 2, 4, "before"), {
    tabIds: [2],
    parentId: 3,
    targetId: 4,
    placement: "before",
    index: 2,
  });
  assert.throws(() => planSubtreeReorder(tabs, 3, 4, "after"), /relative to itself/);
  assert.throws(() => planSubtreeReorder(tabs, 2, 4, "inside"), /before or after/);
});
