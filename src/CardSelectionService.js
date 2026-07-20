var __MN_CARD_SELECTION_SERVICE_MNCardsToMDAddon = (function () {
  const VALID_SCOPES = ["notebook", "mindmap", "card-tree", "selection"];

  function getStudyController(context) {
    if (!context || !context.addon || !context.addon.window) {
      throw new Error("Addon window not available");
    }
    const studyController = Application.sharedInstance().studyController(context.addon.window);
    if (!studyController) throw new Error("studyController not found");
    return studyController;
  }

  function getNotebookController(context) {
    const notebookController = getStudyController(context).notebookController;
    if (!notebookController) throw new Error("notebookController not found");
    return notebookController;
  }

  function getMindmapView(context) {
    const mindmapView = getNotebookController(context).mindmapView;
    if (!mindmapView) throw new Error("mindmapView not found");
    return mindmapView;
  }

  function getSelectedViews(context) {
    return getMindmapView(context).selViewLst || [];
  }

  function arrayFromNSArray(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    const count = typeof value.count === "function" ? Number(value.count()) : Number(value.length || 0);
    const result = [];
    for (let index = 0; index < count; index += 1) {
      result.push(typeof value.objectAtIndex === "function" ? value.objectAtIndex(index) : value[index]);
    }
    return result;
  }

  function numberOrZero(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function resolveNode(selectionItem) {
    if (!selectionItem) return null;
    if (selectionItem.note && selectionItem.note.note) return selectionItem.note;
    if (selectionItem.note && selectionItem.note.noteId) return selectionItem;
    if (selectionItem.noteId || selectionItem.comments || selectionItem.excerptText) {
      return {
        note: selectionItem,
        parentNode: selectionItem.parentNode,
        childNodes: selectionItem.childNodes,
        frame: selectionItem.frame || { x: 0, y: 0 },
      };
    }
    return selectionItem.note || selectionItem;
  }

  function rawNodeOrder(node, fallbackIndex) {
    const frame = node && node.frame ? node.frame : {};
    return [numberOrZero(frame.y), numberOrZero(frame.x), fallbackIndex];
  }

  function compareOrderKeys(left, right) {
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) return left[index] - right[index];
    }
    return 0;
  }

  function compareByVisualOrder(left, right) {
    return compareOrderKeys([left.y, left.x, left.selectionIndex], [right.y, right.x, right.selectionIndex]);
  }

  function sortRawNodes(nodes) {
    return nodes.map(function (node, index) {
      return { node, order: rawNodeOrder(node, index) };
    }).sort(function (left, right) {
      return compareOrderKeys(left.order, right.order);
    }).map(function (entry) {
      return entry.node;
    });
  }

  function buildIndexedNode(node, selectionIndex) {
    const note = node && node.note ? node.note : null;
    if (!note || !note.noteId) throw new Error("脑图卡片缺少noteId");
    const frame = node.frame || {};
    const parentNode = node.parentNode || null;
    return {
      note,
      noteId: String(note.noteId),
      selectionIndex,
      x: numberOrZero(frame.x),
      y: numberOrZero(frame.y),
      parentNoteId: parentNode && parentNode.note && parentNode.note.noteId ? String(parentNode.note.noteId) : null,
      childNoteIds: arrayFromNSArray(node.childNodes).map(function (childNode) {
        if (!childNode || !childNode.note || !childNode.note.noteId) throw new Error("脑图子卡片缺少noteId");
        return String(childNode.note.noteId);
      }),
    };
  }

  function indexMindmapNodes(items, emptyMessage) {
    const selectedById = {};
    const orderedNodes = [];
    items.forEach(function (item, selectionIndex) {
      const node = resolveNode(item);
      if (!node) return;
      const indexedNode = buildIndexedNode(node, selectionIndex);
      if (selectedById[indexedNode.noteId]) return;
      selectedById[indexedNode.noteId] = indexedNode;
      orderedNodes.push(indexedNode);
    });
    orderedNodes.sort(compareByVisualOrder);
    if (orderedNodes.length === 0) throw new Error(emptyMessage);
    return { orderedNodes, selectedById };
  }

  function assertAcyclicMindmap(orderedNodes, selectedById) {
    const state = {};
    function visit(noteId) {
      if (state[noteId] === 1) throw new Error("卡片层级存在循环: " + noteId);
      if (state[noteId] === 2) return;
      state[noteId] = 1;
      selectedById[noteId].childNoteIds.forEach(function (childNoteId) {
        if (selectedById[childNoteId]) visit(childNoteId);
      });
      state[noteId] = 2;
    }
    orderedNodes.forEach(function (node) { visit(node.noteId); });
  }

  function buildMindmapTreeNode(node, selectedById) {
    return {
      note: node.note,
      noteId: node.noteId,
      selectionIndex: node.selectionIndex,
      x: node.x,
      y: node.y,
      depth: 0,
      children: node.childNoteIds.map(function (childNoteId) {
        return selectedById[childNoteId] || null;
      }).filter(Boolean).sort(compareByVisualOrder).map(function (childNode) {
        return buildMindmapTreeNode(childNode, selectedById);
      }),
    };
  }

  function assignDepth(node, depth) {
    node.depth = depth;
    node.children.forEach(function (child) { assignDepth(child, depth + 1); });
  }

  function flattenTreeNodes(roots) {
    const result = [];
    function visit(node) {
      result.push(node);
      node.children.forEach(visit);
    }
    roots.forEach(visit);
    return result;
  }

  function selectionFromMindmapNodes(items, emptyMessage) {
    const indexed = indexMindmapNodes(items, emptyMessage);
    assertAcyclicMindmap(indexed.orderedNodes, indexed.selectedById);
    const roots = indexed.orderedNodes.filter(function (node) {
      return !node.parentNoteId || !indexed.selectedById[node.parentNoteId];
    }).map(function (node) {
      return buildMindmapTreeNode(node, indexed.selectedById);
    });
    if (roots.length === 0) throw new Error("卡片层级不存在根节点");
    roots.forEach(function (root) { assignDepth(root, 0); });
    const treeCards = flattenTreeNodes(roots);
    if (treeCards.length !== indexed.orderedNodes.length) throw new Error("卡片层级包含无法访问的节点");
    return {
      flatCards: indexed.orderedNodes.map(function (node) {
        return { note: node.note, noteId: node.noteId, selectionIndex: node.selectionIndex, x: node.x, y: node.y, depth: 0, children: [] };
      }),
      treeRoots: roots,
      treeCards,
    };
  }

  function collectSelectedSubtrees(context) {
    const selectedNodes = sortRawNodes(arrayFromNSArray(getSelectedViews(context)).map(resolveNode).filter(Boolean));
    if (selectedNodes.length === 0) throw new Error("未选中卡片");
    const collected = [];
    const visited = {};
    const visiting = {};
    function visit(node) {
      if (!node || !node.note || !node.note.noteId) throw new Error("卡片树节点缺少noteId");
      const noteId = String(node.note.noteId);
      if (visiting[noteId]) throw new Error("卡片树层级存在循环: " + noteId);
      if (visited[noteId]) return;
      visiting[noteId] = true;
      collected.push(node);
      sortRawNodes(arrayFromNSArray(node.childNodes)).forEach(visit);
      visiting[noteId] = false;
      visited[noteId] = true;
    }
    selectedNodes.forEach(visit);
    return collected;
  }

  function selectionFromRootNotes(rootNotes, emptyMessage) {
    if (rootNotes.length === 0) throw new Error(emptyMessage);
    const visiting = {};
    const visited = {};
    function build(note, path, depth) {
      const noteId = note && note.noteId ? String(note.noteId) : "";
      if (!noteId) throw new Error("学习集卡片缺少noteId: path=" + path);
      if (visiting[noteId]) throw new Error("学习集卡片层级存在循环: " + noteId);
      if (visited[noteId]) throw new Error("学习集卡片重复出现在多个位置: " + noteId);
      visiting[noteId] = true;
      const children = arrayFromNSArray(note.childNotes).map(function (child, index) {
        return build(child, path + "-" + index, depth + 1);
      });
      visiting[noteId] = false;
      visited[noteId] = true;
      return { note, noteId, selectionIndex: path, x: 0, y: Number(String(path).split("-")[0]) || 0, depth, children };
    }
    const roots = rootNotes.map(function (note, index) { return build(note, String(index), 0); });
    const treeCards = flattenTreeNodes(roots);
    return {
      flatCards: treeCards.map(function (card, index) {
        return { note: card.note, noteId: card.noteId, selectionIndex: index, x: 0, y: index, depth: 0, children: [] };
      }),
      treeRoots: roots,
      treeCards,
    };
  }

  function normalizeScope(scope) {
    const value = scope === undefined || scope === null || scope === "" ? "selection" : String(scope);
    if (VALID_SCOPES.indexOf(value) < 0) throw new Error("未知导出范围: " + value);
    return value;
  }

  function getSelectedCards(context) {
    return selectionFromMindmapNodes(arrayFromNSArray(getSelectedViews(context)), "未选中卡片");
  }

  function getScopeSelection(context, rawScope) {
    const scope = normalizeScope(rawScope);
    if (scope === "selection") {
      return { scope, id: "selection", title: "所选卡片", selection: getSelectedCards(context) };
    }
    if (scope === "card-tree") {
      return { scope, id: "card-tree", title: "卡片树", selection: selectionFromMindmapNodes(collectSelectedSubtrees(context), "未选中卡片") };
    }
    if (scope === "mindmap") {
      const nodes = arrayFromNSArray(getMindmapView(context).mindmapNodes);
      return { scope, id: "current-mindmap", title: "当前脑图", selection: selectionFromMindmapNodes(nodes, "当前脑图没有卡片") };
    }
    const notebookController = getNotebookController(context);
    const notebookId = notebookController.notebookId ? String(notebookController.notebookId) : "";
    if (!notebookId) throw new Error("当前学习集缺少notebookId");
    const notebook = Database.sharedInstance().getNotebookById(notebookId);
    if (!notebook) throw new Error("未找到当前学习集: " + notebookId);
    return {
      scope,
      id: notebookId,
      title: String(notebook.title || "当前学习集"),
      selection: selectionFromRootNotes(arrayFromNSArray(notebook.notes), "当前学习集没有卡片"),
    };
  }

  return { getSelectedCards, getScopeSelection, normalizeScope, arrayFromNSArray };
})();
