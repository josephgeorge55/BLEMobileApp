const {
  withEntitlementsPlist,
  withInfoPlist,
  withXcodeProject,
} = require("@expo/config-plugins");

function withPushNotifications(config) {
  config = withEntitlementsPlist(config, (mod) => {
    mod.modResults["aps-environment"] = "production";
    return mod;
  });

  config = withInfoPlist(config, (mod) => {
    if (!mod.modResults.UIBackgroundModes) {
      mod.modResults.UIBackgroundModes = [];
    }
    if (!mod.modResults.UIBackgroundModes.includes("remote-notification")) {
      mod.modResults.UIBackgroundModes.push("remote-notification");
    }
    return mod;
  });

  return config;
}

module.exports = withPushNotifications;
