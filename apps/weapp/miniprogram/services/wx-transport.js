const { ANALYZE_TIMEOUT_MS } = require("../config.js");

function createWxTransport() {
  return {
    postJson(url, body) {
      return new Promise((resolve, reject) => {
        wx.request({
          url,
          method: "POST",
          data: body,
          timeout: ANALYZE_TIMEOUT_MS,
          header: {
            accept: "application/json",
            "content-type": "application/json",
            "cache-control": "no-store",
          },
          success(res) {
            const status = typeof res.statusCode === "number" ? res.statusCode : 0;
            let text = "";
            try {
              text = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
            } catch (error) {
              reject(new Error("encode"));
              return;
            }
            if (!text) {
              reject(new Error("empty"));
              return;
            }
            resolve({ status, text });
          },
          fail() {
            reject(new Error("network"));
          },
        });
      });
    },
  };
}

module.exports = {
  createWxTransport,
};
