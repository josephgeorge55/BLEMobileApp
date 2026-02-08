require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'BladeWalletPass'
  s.version        = package['version']
  s.summary        = 'Expo module for adding passes to Apple Wallet'
  s.description    = 'Native iOS PassKit support for adding .pkpass files to Apple Wallet'
  s.homepage       = 'https://bladeoutboards.com'
  s.license        = 'MIT'
  s.author         = 'Blade Outboards'
  s.source         = { git: '' }

  s.platform       = :ios, '15.1'
  s.swift_version  = '5.0'
  s.source_files   = '**/*.swift'

  s.frameworks     = 'PassKit', 'UIKit'

  s.dependency 'ExpoModulesCore'
end
