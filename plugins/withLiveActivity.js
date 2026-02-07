const {
  withXcodeProject,
  withInfoPlist,
  withDangerousMod,
} = require("@expo/config-plugins");
const path = require("path");
const fs = require("fs");

const EXT_NAME = "BladeOutboardsWidgetExtension";

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

function withLiveActivity(config) {
  config = withInfoPlist(config, (mod) => {
    mod.modResults.NSSupportsLiveActivities = true;
    return mod;
  });

  config = withDangerousMod(config, [
    "ios",
    async (mod) => {
      const iosPath = path.join(mod.modRequest.projectRoot, "ios");
      const extPath = path.join(iosPath, EXT_NAME);
      fs.mkdirSync(extPath, { recursive: true });

      const srcPath = path.join(
        mod.modRequest.projectRoot,
        "plugins",
        "ios-widget",
      );
      const filesToCopy = [
        "BladeOutboardsAttributes.swift",
        "BladeOutboardsLiveActivity.swift",
        "Info.plist",
      ];

      for (const file of filesToCopy) {
        const src = path.join(srcPath, file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(extPath, file));
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
    var extConfig = appExtensions.find(function(ext) { return ext.targetName === EXT_NAME; });
    const extBundleId = extConfig?.bundleIdentifier || (mainBundleId + ".widget");
    const appleTeamId = getAppleTeamId(mod);

    const target = project.addTarget(
      EXT_NAME,
      "app_extension",
      EXT_NAME,
      extBundleId,
    );

    if (!target) {
      console.warn("[withLiveActivity] Failed to add widget extension target");
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

    const group = project.addPbxGroup([], EXT_NAME, EXT_NAME);
    const mainGroup = project.getFirstProject().firstProject.mainGroup;
    project.addToPbxGroup(group.uuid, mainGroup);

    var swiftFiles = [
      "BladeOutboardsAttributes.swift",
      "BladeOutboardsLiveActivity.swift",
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
      removeDuplicateEmbedPhases(objects, mainTargetObj.firstTarget, EXT_NAME);
    }

    var buildConfigListUuid = nativeTarget.buildConfigurationList;
    var configList = objects.XCConfigurationList[buildConfigListUuid];

    if (configList && configList.buildConfigurations) {
      for (var ci = 0; ci < configList.buildConfigurations.length; ci++) {
        var configRef = configList.buildConfigurations[ci];
        var uuid = configRef.value;
        var buildConfig = objects.XCBuildConfiguration[uuid];
        if (buildConfig && buildConfig.buildSettings) {
          buildConfig.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = "16.2";
          buildConfig.buildSettings.SWIFT_VERSION = "5.0";
          buildConfig.buildSettings.INFOPLIST_FILE =
            EXT_NAME + "/Info.plist";
          buildConfig.buildSettings.MARKETING_VERSION = "1.0";
          buildConfig.buildSettings.CURRENT_PROJECT_VERSION = "1";
          buildConfig.buildSettings.SKIP_INSTALL = "YES";
          buildConfig.buildSettings.TARGETED_DEVICE_FAMILY = '"1,2"';
          buildConfig.buildSettings.PRODUCT_BUNDLE_IDENTIFIER =
            '"' + extBundleId + '"';
          buildConfig.buildSettings.GENERATE_INFOPLIST_FILE = "YES";
          buildConfig.buildSettings.INFOPLIST_KEY_CFBundleDisplayName =
            '"Blade Outboards"';
          buildConfig.buildSettings.LD_RUNPATH_SEARCH_PATHS =
            '"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"';
          buildConfig.buildSettings.PRODUCT_NAME =
            '"$(TARGET_NAME)"';
          buildConfig.buildSettings.SWIFT_EMIT_LOC_STRINGS = "YES";
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

      if (schemeContent.indexOf(EXT_NAME) === -1) {
        var extBuildEntry =
          '      <BuildActionEntry\n' +
          '         buildForTesting = "YES"\n' +
          '         buildForRunning = "YES"\n' +
          '         buildForProfiling = "YES"\n' +
          '         buildForArchiving = "YES"\n' +
          '         buildForAnalyzing = "YES">\n' +
          '         <BuildableReference\n' +
          '            BuildableIdentifier = "primary"\n' +
          '            BlueprintName = "' + EXT_NAME + '"\n' +
          '            ReferencedContainer = "container:BladeOutboards.xcodeproj">\n' +
          '         </BuildableReference>\n' +
          '      </BuildActionEntry>\n';

        schemeContent = schemeContent.replace(
          '</BuildActionEntries>',
          extBuildEntry + '   </BuildActionEntries>'
        );

        fs.writeFileSync(schemePath, schemeContent, "utf8");
      }

      return mod;
    },
  ]);

  return config;
}

module.exports = withLiveActivity;
