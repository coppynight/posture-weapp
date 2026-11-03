const { createSessionStore } = require("./lib/session.js");
const { unlinkQuiet } = require("./services/photos.js");

App({
  session: createSessionStore(),
  onHide() {
    const result = this.session.onAppHide();
    if (!result.cleared) return;
    unlinkQuiet(result.frontPath);
    unlinkQuiet(result.sidePath);
  },
});
