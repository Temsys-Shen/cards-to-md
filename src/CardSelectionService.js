var __MN_CARD_SELECTION_SERVICE_MNCardsToMDAddon = (function () {
  function getStudyController(context) {
    if (!context || !context.addon || !context.addon.window) {
      throw new Error("Addon window not available");
    }

    const studyController = Application.sharedInstance().studyController(context.addon.window);
    if (!studyController) {
      throw new Error("studyController not found");
    }

    return studyController;
  }

  function getSelectedViews(context) {
    const studyController = getStudyController(context);
    const notebookController = studyController.notebookController;
    if (!notebookController) {
      throw new Error("notebookController not found");
    }

    const mindmapView = notebookController.mindmapView;
    if (!mindmapView) {
      throw new Error("mindmapView not found");
    }

    return mindmapView.selViewLst || [];
  }

  function arrayFromNSArray(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;

    const count = typeof value.count === "function" ? Number(value.count()) : Number(value.length || 0);
    const result = [];
    for (let index = 0; index < count; index += 1) {
      if (typeof value.objectAtIndex === "function") {
        result.push(value.objectAtIndex(index));
      } else {
        result.push(value[index]);
      }
    }
    return result;
  }

  function resolveNode(selectionItem) {
    if (!selectionItem) return null;
    if (selectionItem.note && selectionItem.note.note) return selectionItem.note;
    if (selectionItem.noteId || selectionItem.comments || selectionItem.excerptText) return {
      note: selectionItem,
      frame: selectionItem.frame || { x: 0, y: 0 },
    };
    return selectionItem.note || selectionItem;
  }

  function numberOrZero(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function getFrameValue(frame, key) {
    if (!frame) return 0;
    return numberOrZero(frame[key]);
  }

  function getSelectedCards(context) {
    const items = arrayFromNSArray(getSelectedViews(context));
    const seen = {};
    const cards = [];

    items.forEach(function (item, selectionIndex) {
      const node = resolveNode(item);
      const note = node && node.note ? node.note : null;
      if (!note || !note.noteId) return;
      if (seen[note.noteId]) return;

      seen[note.noteId] = true;
      const frame = node.frame || item.frame || {};
      cards.push({
        note,
        selectionIndex,
        x: getFrameValue(frame, "x"),
        y: getFrameValue(frame, "y"),
      });
    });

    cards.sort(function (left, right) {
      if (left.y !== right.y) return left.y - right.y;
      if (left.x !== right.x) return left.x - right.x;
      return left.selectionIndex - right.selectionIndex;
    });

    if (cards.length === 0) {
      throw new Error("未选中卡片");
    }

    return cards;
  }

  return {
    getSelectedCards,
  };
})();
