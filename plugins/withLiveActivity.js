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

    var extBuildSettings = {
      IPHONEOS_DEPLOYMENT_TARGET: "16.2",
      SWIFT_VERSION: "5.0",
      TARGETED_DEVICE_FAMILY: '"1,2"',
      PRODUCT_BUNDLE_IDENTIFIER: '"' + extBundleId + '"',
      INFOPLIST_FILE: EXT_NAME + "/Info.plist",
      PRODUCT_NAME: '"$(TARGET_NAME)"',
      SWIFT_EMIT_LOC_STRINGS: "YES",
      GENERATE_INFOPLIST_FILE: "YES",
      INFOPLIST_KEY_CFBundleDisplayName: '"Blade Outboards"',
      INFOPLIST_KEY_NSExtension: undefined,
      LD_RUNPATH_SEARCH_PATHS: '"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"',
      SKIP_INSTALL: "YES",
      MARKETING_VERSION: "1.0",
      CURRENT_PROJECT_VERSION: "1",
      CLANG_ENABLE_MODULES: "YES",
      CODE_SIGN_STYLE: "Automatic",
    };
    delete extBuildSettings.INFOPLIST_KEY_NSExtension;
    if (devTeam) {
      extBuildSettings.DEVELOPMENT_TEAM = devTeam;
    }

    var debugConfigUuid = project.generateUuid();
    var releaseConfigUuid = project.generateUuid();

    if (!objects.XCBuildConfiguration) objects.XCBuildConfiguration = {};
    objects.XCBuildConfiguration[debugConfigUuid] = {
      isa: 'XCBuildConfiguration',
      buildSettings: Object.assign({}, extBuildSettings, {
        GCC_PREPROCESSOR_DEFINITIONS: ['"DEBUG=1"', '"$(inherited)"'],
      }),
      name: 'Debug',
    };
    objects.XCBuildConfiguration[debugConfigUuid + '_comment'] = 'Debug';
    objects.XCBuildConfiguration[releaseConfigUuid] = {
      isa: 'XCBuildConfiguration',
      buildSettings: Object.assign({}, extBuildSettings),
      name: 'Release',
    };
    objects.XCBuildConfiguration[releaseConfigUuid + '_comment'] = 'Release';

    var configListUuid = project.generateUuid();
    if (!objects.XCConfigurationList) objects.XCConfigurationList = {};
    objects.XCConfigurationList[configListUuid] = {
      isa: 'XCConfigurationList',
      buildConfigurations: [
        { value: debugConfigUuid, comment: 'Debug' },
        { value: releaseConfigUuid, comment: 'Release' },
      ],
      defaultConfigurationIsVisible: 0,
      defaultConfigurationName: 'Release',
    };
    objects.XCConfigurationList[configListUuid + '_comment'] =
      'Build configuration list for PBXNativeTarget "' + EXT_NAME + '"';

    var sourcesPhaseUuid = project.generateUuid();
    if (!objects.PBXSourcesBuildPhase) objects.PBXSourcesBuildPhase = {};
    objects.PBXSourcesBuildPhase[sourcesPhaseUuid] = {
      isa: 'PBXSourcesBuildPhase',
      buildActionMask: 2147483647,
      files: [],
      runOnlyForDeploymentPostprocessing: 0,
    };
    objects.PBXSourcesBuildPhase[sourcesPhaseUuid + '_comment'] = 'Sources';

    var frameworksPhaseUuid = project.generateUuid();
    if (!objects.PBXFrameworksBuildPhase) objects.PBXFrameworksBuildPhase = {};
    objects.PBXFrameworksBuildPhase[frameworksPhaseUuid] = {
      isa: 'PBXFrameworksBuildPhase',
      buildActionMask: 2147483647,
      files: [],
      runOnlyForDeploymentPostprocessing: 0,
    };
    objects.PBXFrameworksBuildPhase[frameworksPhaseUuid + '_comment'] = 'Frameworks';

    var productFileRefUuid = project.generateUuid();
    objects.PBXFileReference[productFileRefUuid] = {
      isa: 'PBXFileReference',
      explicitFileType: '"wrapper.app-extension"',
      includeInIndex: 0,
      path: EXT_NAME + '.appex',
      sourceTree: 'BUILT_PRODUCTS_DIR',
    };
    objects.PBXFileReference[productFileRefUuid + '_comment'] = EXT_NAME + '.appex';

    var productsGroup = null;
    for (var gk in objects.PBXGroup) {
      if (gk.indexOf('_comment') !== -1) continue;
      var g = objects.PBXGroup[gk];
      if (g && g.name === 'Products') {
        productsGroup = g;
        break;
      }
    }
    if (productsGroup && productsGroup.children) {
      productsGroup.children.push({ value: productFileRefUuid, comment: EXT_NAME + '.appex' });
    }

    var targetUuid = project.generateUuid();
    var nativeTarget = {
      isa: 'PBXNativeTarget',
      buildConfigurationList: configListUuid,
      buildPhases: [
        { value: sourcesPhaseUuid, comment: 'Sources' },
        { value: frameworksPhaseUuid, comment: 'Frameworks' },
      ],
      buildRules: [],
      dependencies: [],
      name: '"' + EXT_NAME + '"',
      productName: '"' + EXT_NAME + '"',
      productReference: productFileRefUuid,
      productType: '"com.apple.product-type.app-extension"',
    };

    if (!objects.PBXNativeTarget) objects.PBXNativeTarget = {};
    objects.PBXNativeTarget[targetUuid] = nativeTarget;
    objects.PBXNativeTarget[targetUuid + '_comment'] = EXT_NAME;

    var projectSection = project.pbxProjectSection();
    var projectUuid = project.getFirstProject()['uuid'];
    projectSection[projectUuid]['targets'].push({
      value: targetUuid,
      comment: EXT_NAME,
    });

    var group = project.addPbxGroup([], EXT_NAME, EXT_NAME);
    var mainGroup = project.getFirstProject().firstProject.mainGroup;
    project.addToPbxGroup(group.uuid, mainGroup);

    var swiftFiles = [
      "BladeOutboardsAttributes.swift",
      "BladeOutboardsLiveActivity.swift",
    ];

    var sourcesPhase = objects.PBXSourcesBuildPhase[sourcesPhaseUuid];

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

    var embedProductBuildFileUuid = project.generateUuid();
    objects.PBXBuildFile[embedProductBuildFileUuid] = {
      isa: 'PBXBuildFile',
      fileRef: productFileRefUuid,
      fileRef_comment: EXT_NAME + '.appex',
      settings: { ATTRIBUTES: ['RemoveHeadersOnCopy'] },
    };
    objects.PBXBuildFile[embedProductBuildFileUuid + '_comment'] = EXT_NAME + '.appex in Embed App Extensions';

    var embedPhaseUuid = project.generateUuid();
    if (!objects.PBXCopyFilesBuildPhase) objects.PBXCopyFilesBuildPhase = {};
    objects.PBXCopyFilesBuildPhase[embedPhaseUuid] = {
      isa: 'PBXCopyFilesBuildPhase',
      buildActionMask: 2147483647,
      dstPath: '""',
      dstSubfolderSpec: 13,
      files: [
        { value: embedProductBuildFileUuid, comment: EXT_NAME + '.appex in Embed App Extensions' },
      ],
      name: '"Embed App Extensions"',
      runOnlyForDeploymentPostprocessing: 0,
    };
    objects.PBXCopyFilesBuildPhase[embedPhaseUuid + '_comment'] = 'Embed App Extensions';

    var mainTargetObj = project.getFirstTarget();
    if (mainTargetObj && mainTargetObj.firstTarget) {
      mainTargetObj.firstTarget.buildPhases.push({
        value: embedPhaseUuid,
        comment: 'Embed App Extensions',
      });

      var depTargetProxyUuid = project.generateUuid();
      if (!objects.PBXContainerItemProxy) objects.PBXContainerItemProxy = {};
      objects.PBXContainerItemProxy[depTargetProxyUuid] = {
        isa: 'PBXContainerItemProxy',
        containerPortal: projectUuid,
        containerPortal_comment: 'Project object',
        proxyType: 1,
        remoteGlobalIDString: targetUuid,
        remoteInfo: '"' + EXT_NAME + '"',
      };
      objects.PBXContainerItemProxy[depTargetProxyUuid + '_comment'] = 'PBXContainerItemProxy';

      var depUuid = project.generateUuid();
      if (!objects.PBXTargetDependency) objects.PBXTargetDependency = {};
      objects.PBXTargetDependency[depUuid] = {
        isa: 'PBXTargetDependency',
        target: targetUuid,
        target_comment: EXT_NAME,
        targetProxy: depTargetProxyUuid,
        targetProxy_comment: 'PBXContainerItemProxy',
      };
      objects.PBXTargetDependency[depUuid + '_comment'] = 'PBXTargetDependency';

      if (!mainTargetObj.firstTarget.dependencies) {
        mainTargetObj.firstTarget.dependencies = [];
      }
      mainTargetObj.firstTarget.dependencies.push({
        value: depUuid,
        comment: 'PBXTargetDependency',
      });
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
