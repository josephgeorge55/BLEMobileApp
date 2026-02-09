const { withSettingsGradle, withMainApplication, withAppBuildGradle } = require("@expo/config-plugins");

function withBluetoothClassicSettings(config) {
  return withSettingsGradle(config, (config) => {
    if (!config.modResults.contents.includes("react-native-bluetooth-classic")) {
      config.modResults.contents += `
include ':react-native-bluetooth-classic'
project(':react-native-bluetooth-classic').projectDir = new File(rootProject.projectDir, '../node_modules/react-native-bluetooth-classic/android')
`;
    }
    return config;
  });
}

function withBluetoothClassicAppBuildGradle(config) {
  return withAppBuildGradle(config, (config) => {
    if (!config.modResults.contents.includes("react-native-bluetooth-classic")) {
      config.modResults.contents = config.modResults.contents.replace(
        "dependencies {",
        "dependencies {\n    implementation project(':react-native-bluetooth-classic')"
      );
    }
    return config;
  });
}

function withBluetoothClassicMainApplication(config) {
  return withMainApplication(config, (config) => {
    if (!config.modResults.contents.includes("RNBluetoothClassicPackage")) {
      config.modResults.contents = config.modResults.contents.replace(
        "import expo.modules.ReactNativeHostWrapper",
        "import expo.modules.ReactNativeHostWrapper\nimport kjd.reactnative.bluetooth.RNBluetoothClassicPackage"
      );
      config.modResults.contents = config.modResults.contents.replace(
        "PackageList(this).packages",
        "PackageList(this).packages.apply {\n              add(RNBluetoothClassicPackage())\n            }"
      );
    }
    return config;
  });
}

module.exports = function withBluetoothClassic(config) {
  config = withBluetoothClassicSettings(config);
  config = withBluetoothClassicAppBuildGradle(config);
  config = withBluetoothClassicMainApplication(config);
  return config;
};
