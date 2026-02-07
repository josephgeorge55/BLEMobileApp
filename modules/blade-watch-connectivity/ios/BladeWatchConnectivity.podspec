require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'BladeWatchConnectivity'
  s.version        = package['version']
  s.summary        = 'Expo module for Blade Outboards Watch Connectivity'
  s.description    = 'Native WatchConnectivity bridge for Blade Outboards app'
  s.homepage       = 'https://bladeoutboards.com'
  s.license        = 'MIT'
  s.author         = 'Blade Outboards'
  s.source         = { git: '' }

  s.platform       = :ios, '14.0'
  s.swift_version  = '5.0'
  s.source_files   = '**/*.swift'

  s.dependency 'ExpoModulesCore'
end
