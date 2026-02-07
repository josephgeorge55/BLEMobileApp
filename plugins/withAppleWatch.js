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

function findSourcesPhaseUuid(objects, nativeTarget) {
  if (!nativeTarget.buildPhases) return null;
  for (var i = 0; i < nativeTarget.buildPhases.length; i++) {
    var entry = nativeTarget.buildPhases[i];
    var uuid = (typeof entry === 'string') ? entry : (entry && entry.value ? entry.value : null);
    if (uuid && objects.PBXSourcesBuildPhase && objects.PBXSourcesBuildPhase[uuid]) {
      return uuid;
    }
  }
  return null;
}

function removeDuplicateEmbedPhases(objects, mainTarget, productName) {
  if (!mainTarget || !mainTarget.buildPhases) return;
  var seen = {};
  var toRemove = [];
  for (var i = 0; i < mainTarget.buildPhases.length; i++) {
    var entry = mainTarget.buildPhases[i];
    var uuid = (typeof entry === 'string') ? entry : (entry && entry.value ? entry.value : null);
    if (!uuid) continue;
    var phase = objects.PBXCopyFilesBuildPhase ? objects.PBXCopyFilesBuildPhase[uuid] : null;
    if (phase && phase.files) {
      for (var f = 0; f < phase.files.length; f++) {
        var fileEntry = phase.files[f];
        var fileUuid = (typeof fileEntry === 'string') ? fileEntry : (fileEntry && fileEntry.value ? fileEntry.value : null);
        if (fileUuid) {
          var buildFile = objects.PBXBuildFile[fileUuid];
          if (buildFile && buildFile.fileRef) {
            var fileRef = objects.PBXFileReference[buildFile.fileRef];
            if (fileRef && fileRef.path && fileRef.path.indexOf(productName) !== -1) {
              var key = phase.dstSubfolderSpec + '_' + productName;
              if (seen[key]) {
                toRemove.push(i);
              } else {
                seen[key] = true;
              }
            }
          }
        }
      }
    }
  }
  for (var r = toRemove.length - 1; r >= 0; r--) {
    mainTarget.buildPhases.splice(toRemove[r], 1);
  }
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
      mod.ios?.bundleIdentifier || "app.replit.bladeoutboards";

    var appExtensions = mod.extra?.eas?.build?.experimental?.ios?.appExtensions || [];
    var watchConfig = appExtensions.find(function(ext) { return ext.targetName === WATCH_TARGET_NAME; });
    const watchBundleId = watchConfig?.bundleIdentifier || (mainBundleId + ".watchkitapp");
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
    var nativeTarget = target.pbxNativeTarget;

    var sourcesPhaseUuid = findSourcesPhaseUuid(objects, nativeTarget);

    if (!sourcesPhaseUuid) {
      sourcesPhaseUuid = project.generateUuid();
      if (!objects.PBXSourcesBuildPhase) {
        objects.PBXSourcesBuildPhase = {};
      }
      objects.PBXSourcesBuildPhase[sourcesPhaseUuid] = {
        isa: 'PBXSourcesBuildPhase',
        buildActionMask: 2147483647,
        files: [],
        runOnlyForDeploymentPostprocessing: 0,
      };
      objects.PBXSourcesBuildPhase[sourcesPhaseUuid + '_comment'] = 'Sources';
      if (!nativeTarget.buildPhases) nativeTarget.buildPhases = [];
      nativeTarget.buildPhases.push({ value: sourcesPhaseUuid, comment: 'Sources' });
    }

    var sourcesPhase = objects.PBXSourcesBuildPhase[sourcesPhaseUuid];
    if (!sourcesPhase.files) sourcesPhase.files = [];

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

    var swiftFiles = [
      "BladeWatchApp.swift",
      "WatchConnectivityManager.swift",
      "ContentView.swift",
      "HomeView.swift",
      "TelemetryView.swift",
      "TripView.swift",
    ];

    for (var i = 0; i < swiftFiles.length; i++) {
      var fileName = swiftFiles[i];

      var fileRefUuid = project.generateUuid();
      objects.PBXFileReference[fileRefUuid] = {
        isa: 'PBXFileReference',
        lastKnownFileType: 'sourcecode.swift',
        path: fileName,
        sourceTree: '"<group>"',
      };
      objects.PBXFileReference[fileRefUuid + '_comment'] = fileName;

      var groupObj = objects.PBXGroup[group.uuid];
      if (groupObj && groupObj.children) {
        groupObj.children.push({ value: fileRefUuid, comment: fileName });
      }

      var buildFileUuid = project.generateUuid();
      objects.PBXBuildFile[buildFileUuid] = {
        isa: 'PBXBuildFile',
        fileRef: fileRefUuid,
        fileRef_comment: fileName,
      };
      objects.PBXBuildFile[buildFileUuid + '_comment'] = fileName + ' in Sources';

      sourcesPhase.files.push({ value: buildFileUuid, comment: fileName + ' in Sources' });
    }

    var duplicateSourcesCount = 0;
    var firstSourcesIdx = -1;
    if (nativeTarget.buildPhases) {
      for (var bp = nativeTarget.buildPhases.length - 1; bp >= 0; bp--) {
        var bpEntry = nativeTarget.buildPhases[bp];
        var bpUuid = (typeof bpEntry === 'string') ? bpEntry : (bpEntry && bpEntry.value ? bpEntry.value : null);
        if (bpUuid && objects.PBXSourcesBuildPhase && objects.PBXSourcesBuildPhase[bpUuid]) {
          duplicateSourcesCount++;
          if (duplicateSourcesCount > 1) {
            nativeTarget.buildPhases.splice(bp, 1);
            delete objects.PBXSourcesBuildPhase[bpUuid];
            delete objects.PBXSourcesBuildPhase[bpUuid + '_comment'];
          }
        }
      }
    }

    var mainTargetObj = project.getFirstTarget();
    if (mainTargetObj && mainTargetObj.firstTarget) {
      removeDuplicateEmbedPhases(objects, mainTargetObj.firstTarget, WATCH_TARGET_NAME);
    }

    var buildConfigListUuid = nativeTarget.buildConfigurationList;
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

    return mod;
  });

  config = withDangerousMod(config, [
    "ios",
    async (mod) => {
      const projectRoot = mod.modRequest.projectRoot;
      const schemesDir = path.join(projectRoot, "ios", "BladeOutboards.xcodeproj", "xcshareddata", "xcschemes");
      const schemePath = path.join(schemesDir, "BladeOutboards.xcscheme");

      if (!fs.existsSync(schemePath)) {
        return mod;
      }

      var schemeContent = fs.readFileSync(schemePath, "utf8");

      if (schemeContent.indexOf(WATCH_TARGET_NAME) === -1) {
        var watchBuildEntry = 
          '      <BuildActionEntry\n' +
          '         buildForTesting = "YES"\n' +
          '         buildForRunning = "YES"\n' +
          '         buildForProfiling = "YES"\n' +
          '         buildForArchiving = "YES"\n' +
          '         buildForAnalyzing = "YES">\n' +
          '         <BuildableReference\n' +
          '            BuildableIdentifier = "primary"\n' +
          '            BlueprintName = "' + WATCH_TARGET_NAME + '"\n' +
          '            ReferencedContainer = "container:BladeOutboards.xcodeproj">\n' +
          '         </BuildableReference>\n' +
          '      </BuildActionEntry>\n';

        schemeContent = schemeContent.replace(
          '</BuildActionEntries>',
          watchBuildEntry + '   </BuildActionEntries>'
        );

        fs.writeFileSync(schemePath, schemeContent, "utf8");
      }

      return mod;
    },
  ]);

  return config;
}

module.exports = withAppleWatch;
