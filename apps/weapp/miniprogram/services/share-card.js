const { COPY } = require("../lib/copy.js");
const { paintShareCard, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT } = require("../lib/share-card.js");

function createOffscreen() {
  if (typeof wx.createOffscreenCanvas !== "function") return null;
  try {
    return wx.createOffscreenCanvas({
      type: "2d",
      width: SHARE_CARD_WIDTH,
      height: SHARE_CARD_HEIGHT,
    });
  } catch (error) {
    return null;
  }
}

function paintAndExport(canvas, layout, page) {
  return new Promise((resolve) => {
    try {
      canvas.width = layout.width;
      canvas.height = layout.height;
    } catch (error) {
      // An offscreen canvas already has the size it was created with.
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      resolve(null);
      return;
    }
    paintShareCard(ctx, layout);
    const options = {
      canvas,
      fileType: "png",
      destWidth: layout.width,
      destHeight: layout.height,
      success(res) {
        resolve(res && res.tempFilePath ? res.tempFilePath : null);
      },
      fail() {
        resolve(null);
      },
    };
    if (page) wx.canvasToTempFilePath(options, page);
    else wx.canvasToTempFilePath(options);
  });
}

function exportPageCanvas(page, layout) {
  return new Promise((resolve) => {
    wx.createSelectorQuery()
      .in(page)
      .select("#share-card")
      .fields({ node: true, size: true })
      .exec((res) => {
        const canvas = res && res[0] && res[0].node;
        if (!canvas) {
          resolve(null);
          return;
        }
        paintAndExport(canvas, layout, page).then(resolve);
      });
  });
}

function exportShareImage(page, layout) {
  const offscreen = createOffscreen();
  if (!offscreen) return exportPageCanvas(page, layout);
  return paintAndExport(offscreen, layout, null).then((filePath) => filePath || exportPageCanvas(page, layout));
}

function saveShareImage(filePath) {
  return new Promise((resolve) => {
    wx.saveImageToPhotosAlbum({
      filePath,
      success() {
        resolve("saved");
      },
      fail(err) {
        const message = err && err.errMsg ? String(err.errMsg) : "";
        if (
          message.indexOf("auth") !== -1 ||
          message.indexOf("deny") !== -1 ||
          message.indexOf("privacy") !== -1 ||
          message.indexOf("authorize") !== -1
        ) {
          resolve("denied");
          return;
        }
        resolve("failed");
      },
    });
  });
}

function confirmAlbumAccess() {
  return new Promise((resolve) => {
    wx.showModal({
      title: COPY.shareNeedAlbumTitle,
      content: COPY.shareNeedAlbum,
      confirmText: COPY.shareSettings,
      cancelText: COPY.shareCancel,
      success(res) {
        resolve(Boolean(res && res.confirm));
      },
      fail() {
        resolve(false);
      },
    });
  });
}

function openAlbumSettings() {
  return new Promise((resolve) => {
    wx.openSetting({
      complete() {
        resolve();
      },
    });
  });
}

module.exports = {
  exportShareImage,
  saveShareImage,
  confirmAlbumAccess,
  openAlbumSettings,
};
