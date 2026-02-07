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
      mod.ios?.bundleIdentifier || "app.replit.bladeoutboards";

    var appExtensions = mod.extra?.eas?.build?.experimental?.ios?.appExtensions || [];
    var watchConfig = appExtensions.find(function(ext) { return ext.targetName === WATCH_TARGET_NAME; });
    const watchBundleId = watchConfig?.bundleIdentifier || (mainBundleId + ".watchkitapp");
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

    var watchBuildSettings = {
      WATCHOS_DEPLOYMENT_TARGET: "10.0",
      SWIFT_VERSION: "5.0",
      SDKROOT: "watchos",
      TARGETED_DEVICE_FAMILY: "4",
      PRODUCT_BUNDLE_IDENTIFIER: '"' + watchBundleId + '"',
      INFOPLIST_FILE: WATCH_TARGET_NAME + "/Info.plist",
      PRODUCT_NAME: '"$(TARGET_NAME)"',
      SWIFT_EMIT_LOC_STRINGS: "YES",
      GENERATE_INFOPLIST_FILE: "YES",
      INFOPLIST_KEY_WKCompanionAppBundleIdentifier: '"' + mainBundleId + '"',
      INFOPLIST_KEY_CFBundleDisplayName: '"Blade"',
      INFOPLIST_KEY_WKRunsIndependentlyOfCompanionApp: "NO",
      LD_RUNPATH_SEARCH_PATHS: '"$(inherited) @executable_path/Frameworks"',
      SKIP_INSTALL: "YES",
      MARKETING_VERSION: "1.0",
      CURRENT_PROJECT_VERSION: "1",
      ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES: "YES",
      CLANG_ENABLE_MODULES: "YES",
      CODE_SIGN_STYLE: "Automatic",
    };
    if (devTeam) {
      watchBuildSettings.DEVELOPMENT_TEAM = devTeam;
    }

    var debugConfigUuid = project.generateUuid();
    var releaseConfigUuid = project.generateUuid();

    if (!objects.XCBuildConfiguration) objects.XCBuildConfiguration = {};
    objects.XCBuildConfiguration[debugConfigUuid] = {
      isa: 'XCBuildConfiguration',
      buildSettings: Object.assign({}, watchBuildSettings, {
        GCC_PREPROCESSOR_DEFINITIONS: ['"DEBUG=1"', '"$(inherited)"'],
      }),
      name: 'Debug',
    };
    objects.XCBuildConfiguration[debugConfigUuid + '_comment'] = 'Debug';
    objects.XCBuildConfiguration[releaseConfigUuid] = {
      isa: 'XCBuildConfiguration',
      buildSettings: Object.assign({}, watchBuildSettings),
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
      'Build configuration list for PBXNativeTarget "' + WATCH_TARGET_NAME + '"';

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
      explicitFileType: '"wrapper.application"',
      includeInIndex: 0,
      path: WATCH_TARGET_NAME + '.app',
      sourceTree: 'BUILT_PRODUCTS_DIR',
    };
    objects.PBXFileReference[productFileRefUuid + '_comment'] = WATCH_TARGET_NAME + '.app';

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
      productsGroup.children.push({ value: productFileRefUuid, comment: WATCH_TARGET_NAME + '.app' });
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
      name: '"' + WATCH_TARGET_NAME + '"',
      productName: '"' + WATCH_TARGET_NAME + '"',
      productReference: productFileRefUuid,
      productType: '"com.apple.product-type.application"',
    };

    if (!objects.PBXNativeTarget) objects.PBXNativeTarget = {};
    objects.PBXNativeTarget[targetUuid] = nativeTarget;
    objects.PBXNativeTarget[targetUuid + '_comment'] = WATCH_TARGET_NAME;

    var projectSection = project.pbxProjectSection();
    var projectUuid = project.getFirstProject()['uuid'];
    projectSection[projectUuid]['targets'].push({
      value: targetUuid,
      comment: WATCH_TARGET_NAME,
    });

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
      fileRef_comment: WATCH_TARGET_NAME + '.app',
      settings: { ATTRIBUTES: ['RemoveHeadersOnCopy'] },
    };
    objects.PBXBuildFile[embedProductBuildFileUuid + '_comment'] = WATCH_TARGET_NAME + '.app in Embed Watch Content';

    var embedPhaseUuid = project.generateUuid();
    if (!objects.PBXCopyFilesBuildPhase) objects.PBXCopyFilesBuildPhase = {};
    objects.PBXCopyFilesBuildPhase[embedPhaseUuid] = {
      isa: 'PBXCopyFilesBuildPhase',
      buildActionMask: 2147483647,
      dstPath: '"$(CONTENTS_FOLDER_PATH)/Watch"',
      dstSubfolderSpec: 16,
      files: [
        { value: embedProductBuildFileUuid, comment: WATCH_TARGET_NAME + '.app in Embed Watch Content' },
      ],
      name: '"Embed Watch Content"',
      runOnlyForDeploymentPostprocessing: 0,
    };
    objects.PBXCopyFilesBuildPhase[embedPhaseUuid + '_comment'] = 'Embed Watch Content';

    var mainTargetObj = project.getFirstTarget();
    if (mainTargetObj && mainTargetObj.firstTarget) {
      mainTargetObj.firstTarget.buildPhases.push({
        value: embedPhaseUuid,
        comment: 'Embed Watch Content',
      });

      var depTargetProxyUuid = project.generateUuid();
      if (!objects.PBXContainerItemProxy) objects.PBXContainerItemProxy = {};
      objects.PBXContainerItemProxy[depTargetProxyUuid] = {
        isa: 'PBXContainerItemProxy',
        containerPortal: projectUuid,
        containerPortal_comment: 'Project object',
        proxyType: 1,
        remoteGlobalIDString: targetUuid,
        remoteInfo: '"' + WATCH_TARGET_NAME + '"',
      };
      objects.PBXContainerItemProxy[depTargetProxyUuid + '_comment'] = 'PBXContainerItemProxy';

      var depUuid = project.generateUuid();
      if (!objects.PBXTargetDependency) objects.PBXTargetDependency = {};
      objects.PBXTargetDependency[depUuid] = {
        isa: 'PBXTargetDependency',
        target: targetUuid,
        target_comment: WATCH_TARGET_NAME,
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
