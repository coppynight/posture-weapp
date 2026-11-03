const { reportView } = require("../../lib/present.js");
const { endSession } = require("../../lib/flow.js");
const { COPY } = require("../../lib/copy.js");
const { paintShareCard, saveShareCard, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT } = require("../../lib/share-card.js");
const { unlinkQuiet } = require("../../services/photos.js");

function session() {
  const app = getApp();
  return app && app.session ? app.session : null;
}

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

function saveToAlbum(filePath) {
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

function confirmSettings() {
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

function openSettings() {
  return new Promise((resolve) => {
    wx.openSetting({
      complete() {
        resolve();
      },
    });
  });
}

Page({
  data: {
    disclaimerHeading: "",
    disclaimer: "",
    disclaimerProminent: true,
    issues: [],
    causes: [],
    exercises: [],
    sharing: false,
  },
  onLoad() {
    this.showReport();
  },
  onShow() {
    wx.hideShareMenu({
      menus: ["shareAppMessage", "shareTimeline"],
      fail() {},
    });
    this.showReport();
  },
  onUnload() {
    // Leaving the report page ends this viewing. The bytes were never written to storage.
    try {
      const current = session();
      if (current) current.clearReport();
    } catch (error) {
      // App teardown can run before the page finishes unloading.
    }
  },
  showReport() {
    const current = session();
    const report = current ? current.get().report : null;
    if (!report) {
      if (this._leaving) return;
      this._leaving = true;
      wx.reLaunch({ url: "/pages/capture/capture" });
      return;
    }
    this.setData(reportView(report));
  },
  onAgain() {
    const current = session();
    if (current) endSession(current, unlinkQuiet);
    wx.reLaunch({ url: "/pages/capture/capture" });
  },
  onSaveShare() {
    if (this._sharing) return;
    const current = session();
    const report = current ? current.get().report : null;
    if (!report) {
      wx.showToast({ title: COPY.shareInvalid, icon: "none" });
      return;
    }
    this._sharing = true;
    this.setData({ sharing: true });
    const page = this;
    saveShareCard(report, {
      paintAndExport(layout) {
        return page.exportCard(layout);
      },
      saveToAlbum,
      confirmOpenSettings: confirmSettings,
      openSettings,
      unlink(filePath) {
        unlinkQuiet(filePath);
      },
      hold(open) {
        const store = session();
        if (store) store.holdSession(open);
      },
      notify(kind) {
        const title = kind === "saved" ? COPY.shareSaved : kind === "invalid" ? COPY.shareInvalid : COPY.shareFail;
        wx.showToast({ title, icon: kind === "saved" ? "success" : "none" });
      },
    }).then(
      () => {
        page._sharing = false;
        page.setData({ sharing: false });
      },
      () => {
        page._sharing = false;
        page.setData({ sharing: false });
      },
    );
  },
  exportCard(layout) {
    const page = this;
    const offscreen = createOffscreen();
    if (offscreen) {
      return paintAndExport(offscreen, layout, null).then((filePath) => {
        if (filePath) return filePath;
        return page.exportPageCanvas(layout);
      });
    }
    return page.exportPageCanvas(layout);
  },
  exportPageCanvas(layout) {
    const page = this;
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
  },
});
