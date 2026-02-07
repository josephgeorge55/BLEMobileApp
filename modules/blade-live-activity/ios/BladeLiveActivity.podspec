require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'BladeLiveActivity'
  s.version        = package['version']
  s.summary        = 'Expo module for Blade Outboards Live Activities'
  s.description    = 'Native iOS Live Activity support for Blade Outboards app'
  s.homepage       = 'https://bladeoutboards.com'
  s.license        = 'MIT'
  s.author         = 'Blade Outboards'
  s.source         = { git: '' }

  s.platform       = :ios, '16.1'
  s.swift_version  = '5.0'
  s.source_files   = '**/*.swift'

  s.frameworks     = 'ActivityKit'

  s.dependency 'ExpoModulesCore'
end
