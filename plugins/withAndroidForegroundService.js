const { withAndroidManifest } = require("@expo/config-plugins");

function addPermission(androidManifest, permission) {
  const { manifest } = androidManifest;

  if (!manifest["uses-permission"]) {
    manifest["uses-permission"] = [];
  }

  const exists = manifest["uses-permission"].some(
    (perm) => perm.$?.["android:name"] === permission
  );

  if (!exists) {
    manifest["uses-permission"].push({
      $: { "android:name": permission },
    });
  }
}

function withAndroidForegroundService(config) {
  return withAndroidManifest(config, (config) => {
    const androidManifest = config.modResults;

    addPermission(androidManifest, "android.permission.FOREGROUND_SERVICE");
    addPermission(
      androidManifest,
      "android.permission.FOREGROUND_SERVICE_SPECIAL_USE"
    );
    addPermission(androidManifest, "android.permission.POST_NOTIFICATIONS");

    return config;
  });
}

module.exports = withAndroidForegroundService;
