const { reportView } = require("../../lib/present.js");
const { endSession } = require("../../lib/flow.js");
const { unlinkQuiet } = require("../../services/photos.js");

Page({
  data: {
    disclaimerHeading: "",
    disclaimer: "",
    disclaimerProminent: true,
    issues: [],
    causes: [],
    exercises: [],
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
      const app = getApp();
      if (app && app.session) app.session.clearReport();
    } catch (error) {
      // App teardown can run before the page finishes unloading.
    }
  },
  showReport() {
    const app = getApp();
    const report = app && app.session ? app.session.get().report : null;
    if (!report) {
      if (this._leaving) return;
      this._leaving = true;
      wx.reLaunch({ url: "/pages/capture/capture" });
      return;
    }
    this.setData(reportView(report));
  },
  onAgain() {
    const app = getApp();
    if (app && app.session) endSession(app.session, unlinkQuiet);
    wx.reLaunch({ url: "/pages/capture/capture" });
  },
});
