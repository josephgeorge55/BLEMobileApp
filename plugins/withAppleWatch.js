const {
  withXcodeProject,
  withDangerousMod,
} = require("@expo/config-plugins");
const path = require("path");
const fs = require("fs");

const WATCH_TARGET_NAME = "BladeOutboardsWatch";

function getAppleTeamId(config) {
  if (process.env.APPLE_TEAM_IDENTIFIER) return process.env.APPLE_TEAM_IDENTIFIER;
  if (config.ios && config.ios.appleTeamId) return config.ios.appleTeamId;
  return null;
}

function withAppleWatch(config) {
  config = withDangerousMod(config, [
    "ios",
    async (mod) => {
      const iosPath = path.join(mod.modRequest.projectRoot, "ios");
      const watchPath = path.join(iosPath, WATCH_TARGET_NAME);
      fs.mkdirSync(watchPath, { recursive: true });

      const srcPath = path.join(
        mod.modRequest.projectRoot,
        "plugins",
        "watch-app",
      );
      const filesToCopy = [
        "BladeWatchApp.swift",
        "WatchConnectivityManager.swift",
        "ContentView.swift",
        "HomeView.swift",
        "TelemetryView.swift",
        "TripView.swift",
        "Info.plist",
      ];

      for (const file of filesToCopy) {
        const src = path.join(srcPath, file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(watchPath, file));
        }
      }

      return mod;
    },
  ]);

  config = withXcodeProject(config, (mod) => {
    const project = mod.modResults;
    const mainBundleId =
      mod.ios?.bundleIdentifier || "com.bladeoutboards.app";
    const watchBundleId = mainBundleId + ".watchkitapp";
    const appleTeamId = getAppleTeamId(mod);

    var target = project.addTarget(
      WATCH_TARGET_NAME,
      "watch2_app",
      WATCH_TARGET_NAME,
      watchBundleId,
    );

    if (!target) {
      console.warn("[withAppleWatch] Failed to add Watch target");
      return mod;
    }

    var objects = project.hash.project.objects;

    var devTeam = appleTeamId;
    if (!devTeam) {
      var mainTarget = project.getFirstTarget();
      if (mainTarget && mainTarget.firstTarget) {
        var mainConfigListUuid = mainTarget.firstTarget.buildConfigurationList;
        var mainConfigList = objects.XCConfigurationList[mainConfigListUuid];
        if (mainConfigList && mainConfigList.buildConfigurations) {
          for (var m = 0; m < mainConfigList.buildConfigurations.length; m++) {
            var mainConfigRef = mainConfigList.buildConfigurations[m];
            var mainBuildConfig = objects.XCBuildConfiguration[mainConfigRef.value];
            if (mainBuildConfig && mainBuildConfig.buildSettings && mainBuildConfig.buildSettings.DEVELOPMENT_TEAM) {
              devTeam = mainBuildConfig.buildSettings.DEVELOPMENT_TEAM;
              break;
            }
          }
        }
      }
    }

    var group = project.addPbxGroup([], WATCH_TARGET_NAME, WATCH_TARGET_NAME);
    var mainGroup = project.getFirstProject().firstProject.mainGroup;
    project.addToPbxGroup(group.uuid, mainGroup);

    project.addBuildPhase([], 'PBXSourcesBuildPhase', 'Sources', target.uuid);
    project.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', target.uuid);

    var swiftFiles = [
      "BladeWatchApp.swift",
      "WatchConnectivityManager.swift",
      "ContentView.swift",
      "HomeView.swift",
      "TelemetryView.swift",
      "TripView.swift",
    ];

    for (var i = 0; i < swiftFiles.length; i++) {
      project.addSourceFile(
        swiftFiles[i],
        { target: target.uuid },
        group.uuid,
      );
    }

    var buildConfigListUuid = target.pbxNativeTarget.buildConfigurationList;
    var configList = objects.XCConfigurationList[buildConfigListUuid];

    if (configList && configList.buildConfigurations) {
      for (var j = 0; j < configList.buildConfigurations.length; j++) {
        var configRef = configList.buildConfigurations[j];
        var uuid = configRef.value;
        var buildConfig = objects.XCBuildConfiguration[uuid];
        if (buildConfig && buildConfig.buildSettings) {
          buildConfig.buildSettings.WATCHOS_DEPLOYMENT_TARGET = "10.0";
          buildConfig.buildSettings.SWIFT_VERSION = "5.0";
          buildConfig.buildSettings.SDKROOT = "watchos";
          buildConfig.buildSettings.TARGETED_DEVICE_FAMILY = "4";
          buildConfig.buildSettings.PRODUCT_BUNDLE_IDENTIFIER =
            '"' + watchBundleId + '"';
          buildConfig.buildSettings.INFOPLIST_FILE =
            WATCH_TARGET_NAME + "/Info.plist";
          buildConfig.buildSettings.PRODUCT_NAME = '"$(TARGET_NAME)"';
          buildConfig.buildSettings.SWIFT_EMIT_LOC_STRINGS = "YES";
          buildConfig.buildSettings.GENERATE_INFOPLIST_FILE = "YES";
          buildConfig.buildSettings.INFOPLIST_KEY_WKCompanionAppBundleIdentifier =
            '"' + mainBundleId + '"';
          buildConfig.buildSettings.INFOPLIST_KEY_CFBundleDisplayName = '"Blade"';
          buildConfig.buildSettings.INFOPLIST_KEY_WKRunsIndependentlyOfCompanionApp = "NO";
          buildConfig.buildSettings.LD_RUNPATH_SEARCH_PATHS =
            '"$(inherited) @executable_path/Frameworks"';
          buildConfig.buildSettings.SKIP_INSTALL = "YES";
          buildConfig.buildSettings.MARKETING_VERSION = "1.0";
          buildConfig.buildSettings.CURRENT_PROJECT_VERSION = "1";
          buildConfig.buildSettings.ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES = "YES";
          buildConfig.buildSettings.CLANG_ENABLE_MODULES = "YES";
          if (devTeam) {
            buildConfig.buildSettings.DEVELOPMENT_TEAM = devTeam;
          }
        }
      }
    }

    var firstTarget = project.getFirstTarget();
    if (!firstTarget || !firstTarget.firstTarget) {
      console.warn("[withAppleWatch] Could not find main target for embedding");
      return mod;
    }
    var mainTargetObj = firstTarget.firstTarget;
    var mainTargetUuid = mainTargetObj.uuid;
    var watchProductRef = target.pbxNativeTarget.productReference;

    var copyPhaseUuid = project.generateUuid();
    var copyBuildFileUuid = project.generateUuid();
    var containerProxyUuid = project.generateUuid();
    var targetDepUuid = project.generateUuid();

    if (!objects.PBXBuildFile) {
      objects.PBXBuildFile = {};
    }
    objects.PBXBuildFile[copyBuildFileUuid] = {
      isa: 'PBXBuildFile',
      fileRef: watchProductRef,
      settings: { ATTRIBUTES: ['RemoveHeadersOnCopy'] },
    };
    objects.PBXBuildFile[copyBuildFileUuid + '_comment'] = WATCH_TARGET_NAME + '.app in Embed Watch Content';

    if (!objects.PBXCopyFilesBuildPhase) {
      objects.PBXCopyFilesBuildPhase = {};
    }
    objects.PBXCopyFilesBuildPhase[copyPhaseUuid] = {
      isa: 'PBXCopyFilesBuildPhase',
      buildActionMask: 2147483647,
      dstPath: '"$(CONTENTS_FOLDER_PATH)/Watch"',
      dstSubfolderSpec: 16,
      files: [
        { value: copyBuildFileUuid, comment: WATCH_TARGET_NAME + '.app in Embed Watch Content' },
      ],
      name: '"Embed Watch Content"',
      runOnlyForDeploymentPostprocessing: 0,
    };
    objects.PBXCopyFilesBuildPhase[copyPhaseUuid + '_comment'] = 'Embed Watch Content';

    var mainNativeTarget = objects.PBXNativeTarget[mainTargetUuid];
    if (mainNativeTarget) {
      if (!mainNativeTarget.buildPhases) {
        mainNativeTarget.buildPhases = [];
      }
      mainNativeTarget.buildPhases.push({
        value: copyPhaseUuid,
        comment: 'Embed Watch Content',
      });
    }

    var projectUuid = project.getFirstProject().firstProject.project;

    if (!objects.PBXContainerItemProxy) {
      objects.PBXContainerItemProxy = {};
    }
    objects.PBXContainerItemProxy[containerProxyUuid] = {
      isa: 'PBXContainerItemProxy',
      containerPortal: projectUuid,
      proxyType: 1,
      remoteGlobalIDString: target.uuid,
      remoteInfo: WATCH_TARGET_NAME,
    };
    objects.PBXContainerItemProxy[containerProxyUuid + '_comment'] = 'PBXContainerItemProxy';

    if (!objects.PBXTargetDependency) {
      objects.PBXTargetDependency = {};
    }
    objects.PBXTargetDependency[targetDepUuid] = {
      isa: 'PBXTargetDependency',
      target: target.uuid,
      targetProxy: containerProxyUuid,
    };
    objects.PBXTargetDependency[targetDepUuid + '_comment'] = 'PBXTargetDependency';

    if (mainNativeTarget) {
      if (!mainNativeTarget.dependencies) {
        mainNativeTarget.dependencies = [];
      }
      mainNativeTarget.dependencies.push({
        value: targetDepUuid,
        comment: 'PBXTargetDependency',
      });
    }

    return mod;
  });

  return config;
}

module.exports = withAppleWatch;
