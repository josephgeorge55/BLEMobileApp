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

function addSourceFileToTarget(project, filePath, groupUuid, targetUuid) {
  var objects = project.hash.project.objects;

  var fileRefUuid = project.generateUuid();
  objects.PBXFileReference[fileRefUuid] = {
    isa: 'PBXFileReference',
    lastKnownFileType: 'sourcecode.swift',
    path: filePath,
    sourceTree: '"<group>"',
  };
  objects.PBXFileReference[fileRefUuid + '_comment'] = filePath;

  var groupObj = objects.PBXGroup[groupUuid];
  if (groupObj && groupObj.children) {
    groupObj.children.push({ value: fileRefUuid, comment: filePath });
  }

  var buildFileUuid = project.generateUuid();
  objects.PBXBuildFile[buildFileUuid] = {
    isa: 'PBXBuildFile',
    fileRef: fileRefUuid,
    fileRef_comment: filePath,
  };
  objects.PBXBuildFile[buildFileUuid + '_comment'] = filePath + ' in Sources';

  var nativeTarget = objects.PBXNativeTarget[targetUuid];
  if (nativeTarget && nativeTarget.buildPhases) {
    for (var i = 0; i < nativeTarget.buildPhases.length; i++) {
      var phaseUuid = nativeTarget.buildPhases[i].value;
      if (objects.PBXSourcesBuildPhase && objects.PBXSourcesBuildPhase[phaseUuid]) {
        var phase = objects.PBXSourcesBuildPhase[phaseUuid];
        if (!phase.files) phase.files = [];
        phase.files.push({ value: buildFileUuid, comment: filePath + ' in Sources' });
        break;
      }
    }
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

    addSourceFileToTarget(project, "BladeOutboardsAttributes.swift", group.uuid, target.uuid);
    addSourceFileToTarget(project, "BladeOutboardsLiveActivity.swift", group.uuid, target.uuid);

    var mainTargetObj = project.getFirstTarget();
    if (mainTargetObj && mainTargetObj.firstTarget) {
      var mainTargetUuid = null;
      for (var k in objects.PBXNativeTarget) {
        if (k.indexOf('_comment') >= 0) continue;
        if (objects.PBXNativeTarget[k] === mainTargetObj.firstTarget) {
          mainTargetUuid = k;
          break;
        }
      }
      if (!mainTargetUuid) {
        for (var k2 in objects.PBXNativeTarget) {
          if (k2.indexOf('_comment') >= 0) continue;
          var nt = objects.PBXNativeTarget[k2];
          if (nt && nt.productType === '"com.apple.product-type.application"' && k2 !== target.uuid) {
            mainTargetUuid = k2;
            break;
          }
        }
      }
      if (mainTargetUuid) {
        var productRefUuid = target.pbxNativeTarget.productReference;
        if (!productRefUuid) {
          for (var fk in objects.PBXFileReference) {
            if (fk.indexOf('_comment') >= 0) continue;
            var fref = objects.PBXFileReference[fk];
            if (fref && fref.path === EXT_NAME + '.appex') {
              productRefUuid = fk;
              break;
            }
          }
        }
        if (productRefUuid) {
          var embedBuildFileUuid = project.generateUuid();
          objects.PBXBuildFile[embedBuildFileUuid] = {
            isa: 'PBXBuildFile',
            fileRef: productRefUuid,
            fileRef_comment: EXT_NAME + '.appex',
            settings: { ATTRIBUTES: ['RemoveHeadersOnCopy'] },
          };
          objects.PBXBuildFile[embedBuildFileUuid + '_comment'] = EXT_NAME + '.appex in Embed Foundation Extensions';

          var embedPhaseUuid = project.generateUuid();
          if (!objects.PBXCopyFilesBuildPhase) {
            objects.PBXCopyFilesBuildPhase = {};
          }
          objects.PBXCopyFilesBuildPhase[embedPhaseUuid] = {
            isa: 'PBXCopyFilesBuildPhase',
            buildActionMask: 2147483647,
            dstPath: '""',
            dstSubfolderSpec: 13,
            files: [
              { value: embedBuildFileUuid, comment: EXT_NAME + '.appex in Embed Foundation Extensions' },
            ],
            name: '"Embed Foundation Extensions"',
            runOnlyForDeploymentPostprocessing: 0,
          };
          objects.PBXCopyFilesBuildPhase[embedPhaseUuid + '_comment'] = 'Embed Foundation Extensions';

          var mainNativeTarget = objects.PBXNativeTarget[mainTargetUuid];
          if (mainNativeTarget && mainNativeTarget.buildPhases) {
            mainNativeTarget.buildPhases.push({
              value: embedPhaseUuid,
              comment: 'Embed Foundation Extensions',
            });
          }
        }
      }
    }

    var buildConfigListUuid = target.pbxNativeTarget.buildConfigurationList;
    var configList = objects.XCConfigurationList[buildConfigListUuid];

    if (configList && configList.buildConfigurations) {
      for (var i = 0; i < configList.buildConfigurations.length; i++) {
        var configRef = configList.buildConfigurations[i];
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

  return config;
}

module.exports = withLiveActivity;
