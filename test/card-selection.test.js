const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");

const source = fs.readFileSync(path.resolve(__dirname, "../src/CardSelectionService.js"), "utf8");

function note(noteId, childNotes = []) {
  return { noteId, noteTitle: noteId, childNotes };
}

function node(noteId, x, y) {
  return { note: note(noteId), frame: { x, y }, parentNode: null, childNodes: [] };
}

function connect(parent, ...children) {
  parent.childNodes = children;
  parent.note.childNotes = children.map((child) => child.note);
  children.forEach((child) => { child.parentNode = parent; });
  return parent;
}

function createService({ selected = [], mindmap = [], notebookNotes = [], notebookId = "book" } = {}) {
  const notebook = { title: "测试学习集", notes: notebookNotes };
  const context = vm.createContext({
    Application: {
      sharedInstance() {
        return {
          studyController() {
            return {
              notebookController: {
                notebookId,
                mindmapView: { selViewLst: selected, mindmapNodes: mindmap },
              },
            };
          },
        };
      },
    },
    Database: {
      sharedInstance() {
        return { getNotebookById(id) { return id === notebookId ? notebook : null; } };
      },
    },
  });
  vm.runInContext(source, context, { filename: "src/CardSelectionService.js" });
  const service = context.__MN_CARD_SELECTION_SERVICE_MNCardsToMDAddon;
  return {
    getScopeSelection(_context, scope) {
      return service.getScopeSelection({ addon: { window: {} } }, scope);
    },
  };
}

function ids(cards) {
  return Array.from(cards, (card) => String(card.noteId));
}

test("selection exports only explicitly selected cards in visual order", () => {
  const root = node("root", 0, 0);
  const child = node("child", 10, 10);
  connect(root, child);
  const selection = createService({ selected: [root] }).getScopeSelection({}, "selection").selection;
  assert.deepEqual(ids(selection.flatCards), ["root"]);
  assert.deepEqual(ids(selection.treeCards), ["root"]);
});

test("card-tree merges selected subtrees and removes parent-child duplicates", () => {
  const root = node("root", 0, 0);
  const child = node("child", 10, 10);
  const grandchild = node("grandchild", 20, 20);
  const other = node("other", 100, 0);
  connect(child, grandchild);
  connect(root, child);
  const selection = createService({ selected: [child, other, root] }).getScopeSelection({}, "card-tree").selection;
  assert.deepEqual(ids(selection.flatCards), ["root", "other", "child", "grandchild"]);
  assert.deepEqual(ids(selection.treeRoots), ["root", "other"]);
  assert.deepEqual(ids(selection.treeCards), ["root", "child", "grandchild", "other"]);
});

test("card-tree recursively exports one selected root", () => {
  const root = node("root", 0, 0);
  const child = node("child", 10, 10);
  connect(root, child);
  const selection = createService({ selected: [root] }).getScopeSelection({}, "card-tree").selection;
  assert.deepEqual(ids(selection.treeRoots), ["root"]);
  assert.deepEqual(ids(selection.treeCards), ["root", "child"]);
});

test("mindmap exports every node without depending on selection", () => {
  const root = node("root", 0, 0);
  const child = node("child", 10, 10);
  connect(root, child);
  const selection = createService({ selected: [], mindmap: [child, root] }).getScopeSelection({}, "mindmap").selection;
  assert.deepEqual(ids(selection.flatCards), ["root", "child"]);
  assert.deepEqual(ids(selection.treeCards), ["root", "child"]);
});

test("notebook recursively preserves root and child order", () => {
  const firstGrandchild = note("first-grandchild");
  const first = note("first", [note("first-child"), firstGrandchild]);
  const second = note("second", [note("second-child")]);
  const result = createService({ notebookNotes: [first, second] }).getScopeSelection({}, "notebook");
  assert.equal(result.id, "book");
  assert.equal(result.title, "测试学习集");
  assert.deepEqual(ids(result.selection.treeCards), ["first", "first-child", "first-grandchild", "second", "second-child"]);
  assert.deepEqual(ids(result.selection.flatCards), ["first", "first-child", "first-grandchild", "second", "second-child"]);
});

test("scope validation reports empty ranges and invalid hierarchies", () => {
  assert.throws(() => createService().getScopeSelection({}, "selection"), /未选中卡片/);
  assert.throws(() => createService().getScopeSelection({}, "card-tree"), /未选中卡片/);
  assert.throws(() => createService().getScopeSelection({}, "mindmap"), /当前脑图没有卡片/);
  assert.throws(() => createService().getScopeSelection({}, "notebook"), /当前学习集没有卡片/);
  assert.throws(() => createService().getScopeSelection({}, "other"), /未知导出范围: other/);
  assert.throws(
    () => createService({ mindmap: [{ note: {}, frame: { x: 0, y: 0 }, childNodes: [] }] }).getScopeSelection({}, "mindmap"),
    /脑图卡片缺少noteId/,
  );
  assert.throws(
    () => createService({ notebookNotes: [{ childNotes: [] }] }).getScopeSelection({}, "notebook"),
    /学习集卡片缺少noteId/,
  );

  const first = note("first");
  const second = note("second");
  first.childNotes = [second];
  second.childNotes = [first];
  assert.throws(() => createService({ notebookNotes: [first] }).getScopeSelection({}, "notebook"), /学习集卡片层级存在循环: first/);

  const root = node("root", 0, 0);
  const child = node("child", 10, 10);
  root.childNodes = [child];
  child.parentNode = root;
  child.childNodes = [root];
  root.parentNode = child;
  assert.throws(() => createService({ selected: [root] }).getScopeSelection({}, "card-tree"), /卡片树层级存在循环: root/);
});
