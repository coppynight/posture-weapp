const { reportView } = require("../../lib/present.js");
const { endSession } = require("../../lib/flow.js");
const { COPY } = require("../../lib/copy.js");
const { saveShareCard } = require("../../lib/share-card.js");
const { unlinkQuiet } = require("../../services/photos.js");
const { exportShareImage, saveShareImage, confirmAlbumAccess, openAlbumSettings } = require("../../services/share-card.js");

function session() {
  const app = getApp();
  return app && app.session ? app.session : null;
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
        return exportShareImage(page, layout);
      },
      saveToAlbum: saveShareImage,
      confirmOpenSettings: confirmAlbumAccess,
      openSettings: openAlbumSettings,
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
});
