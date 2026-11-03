function readPhoto(shot) {
  return new Promise((resolve, reject) => {
    const fsm = wx.getFileSystemManager();
    const finish = (filePath, extraPath) => {
      fsm.readFile({
        filePath,
        encoding: "base64",
        success(res) {
          if (extraPath) unlinkQuiet(extraPath);
          if (typeof res.data !== "string" || res.data.length === 0) {
            reject(new Error("empty"));
            return;
          }
          resolve({ mediaType: shot.mediaType, dataBase64: res.data });
        },
        fail() {
          if (extraPath) unlinkQuiet(extraPath);
          reject(new Error("read"));
        },
      });
    };

    if (typeof wx.compressImage !== "function") {
      finish(shot.tempFilePath, null);
      return;
    }
    wx.compressImage({
      src: shot.tempFilePath,
      quality: 60,
      success(res) {
        const compressed = res.tempFilePath;
        if (!compressed || compressed === shot.tempFilePath) {
          finish(shot.tempFilePath, null);
          return;
        }
        finish(compressed, compressed);
      },
      fail() {
        finish(shot.tempFilePath, null);
      },
    });
  });
}

function choosePhoto(source) {
  return new Promise((resolve) => {
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: [source],
      sizeType: ["compressed"],
      camera: "back",
      success(res) {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file || !file.tempFilePath) {
          resolve({ status: "failed" });
          return;
        }
        resolve({ status: "picked", tempFilePath: file.tempFilePath });
      },
      fail(err) {
        const message = err && err.errMsg ? String(err.errMsg) : "";
        if (message.indexOf("cancel") !== -1) {
          resolve({ status: "cancelled" });
          return;
        }
        resolve({ status: "failed" });
      },
    });
  });
}

function unlinkQuiet(filePath) {
  if (!filePath) return;
  try {
    wx.getFileSystemManager().unlink({
      filePath,
      fail() {},
    });
  } catch (error) {
    // The temp file may already have been removed with the session.
  }
}

module.exports = {
  readPhoto,
  choosePhoto,
  unlinkQuiet,
};
