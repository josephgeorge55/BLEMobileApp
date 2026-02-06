const {
  withXcodeProject,
  withInfoPlist,
  withDangerousMod,
} = require("@expo/config-plugins");
const path = require("path");
const fs = require("fs");

const EXT_NAME = "BladeOutboardsWidgetExtension";

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
      mod.ios?.bundleIdentifier || "com.bladeoutboards.app";
    const extBundleId = mainBundleId + ".widget";

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

    const group = project.addPbxGroup([], EXT_NAME, EXT_NAME);
    const mainGroup = project.getFirstProject().firstProject.mainGroup;
    project.addToPbxGroup(group.uuid, mainGroup);

    project.addSourceFile(
      EXT_NAME + "/BladeOutboardsAttributes.swift",
      { target: target.uuid },
      group.uuid,
    );
    project.addSourceFile(
      EXT_NAME + "/BladeOutboardsLiveActivity.swift",
      { target: target.uuid },
      group.uuid,
    );

    var buildConfigListUuid = target.pbxNativeTarget.buildConfigurationList;
    var objects = project.hash.project.objects;
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
          buildConfig.buildSettings.CODE_SIGN_STYLE = "Automatic";
          buildConfig.buildSettings.SKIP_INSTALL = "YES";
          buildConfig.buildSettings.TARGETED_DEVICE_FAMILY = '"1,2"';
          buildConfig.buildSettings.PRODUCT_BUNDLE_IDENTIFIER =
            '"' + extBundleId + '"';
          buildConfig.buildSettings.GENERATE_INFOPLIST_FILE = "YES";
          buildConfig.buildSettings.ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME =
            "AccentColor";
          buildConfig.buildSettings.LD_RUNPATH_SEARCH_PATHS =
            '"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"';
          buildConfig.buildSettings.PRODUCT_NAME =
            '"$(TARGET_NAME)"';
          buildConfig.buildSettings.SWIFT_EMIT_LOC_STRINGS = "YES";
        }
      }
    }

    var nativeTarget = objects.PBXNativeTarget[target.uuid];
    var productRefUuid = nativeTarget ? nativeTarget.productReference : null;

    if (productRefUuid) {
      var productsGroupFound = false;
      var pbxGroups = objects.PBXGroup;
      var groupUuids = Object.keys(pbxGroups);
      for (var g = 0; g < groupUuids.length; g++) {
        var grp = pbxGroups[groupUuids[g]];
        if (grp && grp.name === "Products") {
          grp.children.push({ value: productRefUuid, comment: EXT_NAME + ".appex" });
          productsGroupFound = true;
          break;
        }
      }
      if (!productsGroupFound) {
        var productsGroup = project.addPbxGroup([], "Products", "Products");
        productsGroup.children = [{ value: productRefUuid, comment: EXT_NAME + ".appex" }];
        project.addToPbxGroup(productsGroup.uuid, project.getFirstProject().firstProject.mainGroup);
      }
    }

    var mainTarget = project.getFirstTarget();
    if (mainTarget && productRefUuid) {
      var proxyUuid = project.generateUuid();
      var depUuid = project.generateUuid();
      var projectUuid = project.getFirstProject().uuid;

      objects.PBXContainerItemProxy = objects.PBXContainerItemProxy || {};
      objects.PBXContainerItemProxy[proxyUuid] = {
        isa: "PBXContainerItemProxy",
        containerPortal: projectUuid,
        proxyType: 1,
        remoteGlobalIDString: target.uuid,
        remoteInfo: '"' + EXT_NAME + '"',
      };
      objects.PBXContainerItemProxy[proxyUuid + "_comment"] = "PBXContainerItemProxy";

      objects.PBXTargetDependency = objects.PBXTargetDependency || {};
      objects.PBXTargetDependency[depUuid] = {
        isa: "PBXTargetDependency",
        target: target.uuid,
        targetProxy: proxyUuid,
      };
      objects.PBXTargetDependency[depUuid + "_comment"] = "PBXTargetDependency";

      var mainNativeTargetForDep = objects.PBXNativeTarget[mainTarget.firstTarget.uuid];
      if (mainNativeTargetForDep) {
        if (!mainNativeTargetForDep.dependencies) {
          mainNativeTargetForDep.dependencies = [];
        }
        mainNativeTargetForDep.dependencies.push({ value: depUuid, comment: "PBXTargetDependency" });
      }

      var embedPhaseUuid = project.generateUuid();
      var buildFileUuid = project.generateUuid();

      objects.PBXBuildFile[buildFileUuid] = {
        isa: "PBXBuildFile",
        fileRef: productRefUuid,
        settings: { ATTRIBUTES: ["RemoveHeadersOnCopy"] },
      };
      objects.PBXBuildFile[buildFileUuid + "_comment"] = EXT_NAME + ".appex in Embed Foundation Extensions";

      objects.PBXCopyFilesBuildPhase = objects.PBXCopyFilesBuildPhase || {};
      objects.PBXCopyFilesBuildPhase[embedPhaseUuid] = {
        isa: "PBXCopyFilesBuildPhase",
        buildActionMask: 2147483647,
        dstPath: '""',
        dstSubfolderSpec: 13,
        files: [{ value: buildFileUuid, comment: EXT_NAME + ".appex in Embed Foundation Extensions" }],
        name: '"Embed Foundation Extensions"',
        runOnlyForDeploymentPostprocessing: 0,
      };
      objects.PBXCopyFilesBuildPhase[embedPhaseUuid + "_comment"] = "Embed Foundation Extensions";

      var mainNativeTarget = objects.PBXNativeTarget[mainTarget.firstTarget.uuid];
      if (mainNativeTarget && mainNativeTarget.buildPhases) {
        mainNativeTarget.buildPhases.push({ value: embedPhaseUuid, comment: "Embed Foundation Extensions" });
      }
    }

    return mod;
  });

  return config;
}

module.exports = withLiveActivity;
