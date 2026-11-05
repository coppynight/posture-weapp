const { captureView, resolveCaptureStep, routeAfterRetake } = require("../../lib/present.js");
const { pickImage, removeImage, submitAnalysis } = require("../../lib/flow.js");
const { emptySessionState } = require("../../lib/session.js");
const { choosePhoto, readPhoto, unlinkQuiet } = require("../../services/photos.js");
const { createWxTransport } = require("../../services/wx-transport.js");
const config = require("../../config.js");

function store() {
  return getApp().session;
}

function refreshCapturePages() {
  const pages = getCurrentPages();
  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    if (page && page.route === "pages/capture/capture" && typeof page.sync === "function") page.sync();
  }
}

Page({
  data: captureView(emptySessionState(), "front"),
  onLoad(query) {
    this._step = query && query.step === "side" ? "side" : "front";
  },
  onShow() {
    wx.hideShareMenu({
      menus: ["shareAppMessage", "shareTimeline"],
      fail() {},
    });
    const state = store().get();
    if (this._step === "side" && resolveCaptureStep(state, "side") === "front" && !state.submitting) {
      this.leaveToFront();
      return;
    }
    this.sync({ scroll: true });
  },
  sync(options) {
    const step = this._step === "side" ? "side" : "front";
    const view = captureView(store().get(), step);
    this.setData(view);
    if (!view.retake) {
      this._didScrollRetake = false;
      return;
    }
    if (options && options.scroll && !this._didScrollRetake) {
      this._didScrollRetake = true;
      wx.pageScrollTo({ selector: ".retake", duration: 200 });
    }
  },
  leaveToFront() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
      return;
    }
    this._step = "front";
    this.sync({ scroll: true });
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
  onNext() {
    const state = store().get();
    if (state.submitting || !state.front) return;
    wx.navigateTo({ url: "/pages/capture/capture?step=side" });
  },
  onBackFront() {
    if (store().get().submitting) return;
    this.leaveToFront();
  },
  onSubmit() {
    if (this._step !== "side") return;
    const page = this;
    void submitAnalysis(store(), {
      read: readPhoto,
      transport: createWxTransport(),
      baseUrl: config.apiBaseUrl,
      unlink: unlinkQuiet,
      openReport() {
        wx.navigateTo({ url: "/pages/report/report" });
      },
    }).then((result) => {
      refreshCapturePages();
      if (result !== "retake") return;
      const guidance = store().get().retakeGuidance;
      if (guidance && routeAfterRetake(guidance) === "front") {
        page.leaveToFront();
        return;
      }
      wx.pageScrollTo({ selector: ".retake", duration: 200 });
    });
  },
});
