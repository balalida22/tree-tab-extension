import assert from "node:assert/strict";
import test from "node:test";

import { buildTree, collectSubtreeIds } from "../tree-model.mjs";

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
