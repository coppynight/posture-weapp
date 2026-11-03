const { captureView } = require("../../lib/present.js");
const { pickImage, removeImage, submitAnalysis } = require("../../lib/flow.js");
const { emptySessionState } = require("../../lib/session.js");
const { choosePhoto, readPhoto, unlinkQuiet } = require("../../services/photos.js");
const { createWxTransport } = require("../../services/wx-transport.js");
const config = require("../../config.js");

function store() {
  return getApp().session;
}

Page({
  data: captureView(emptySessionState()),
  onShow() {
    wx.hideShareMenu({
      menus: ["shareAppMessage", "shareTimeline"],
      fail() {},
    });
    this.sync();
  },
  sync() {
    this.setData(captureView(store().get()));
  },
  onPick(event) {
    const view = event.currentTarget.dataset.view;
    const source = event.currentTarget.dataset.source;
    if (view !== "front" && view !== "side") return;
    if (source !== "camera" && source !== "album") return;
    void pickImage(store(), view, source, {
      choose: choosePhoto,
      unlink: unlinkQuiet,
    }).then(() => {
      this.sync();
    });
  },
  onRemove(event) {
    const view = event.currentTarget.dataset.view;
    if (view !== "front" && view !== "side") return;
    removeImage(store(), view, unlinkQuiet);
    this.sync();
  },
  onSubmit() {
    void submitAnalysis(store(), {
      read: readPhoto,
      transport: createWxTransport(),
      baseUrl: config.apiBaseUrl,
      unlink: unlinkQuiet,
      openReport() {
        wx.navigateTo({ url: "/pages/report/report" });
      },
    }).then((result) => {
      this.sync();
      if (result === "retake") {
        wx.pageScrollTo({ selector: ".retake", duration: 200 });
      }
    });
  },
});
