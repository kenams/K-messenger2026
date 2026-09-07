require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'KssengerSignal'
  s.version        = package['version']
  s.summary        = 'K-ssenger native Signal Protocol module (iOS)'
  s.description     = 'iOS LibSignalClient bridge for K-ssenger E2EE — parity with the Android kssenger-signal module.'
  s.author         = 'KAH Digital'
  s.homepage       = 'https://kah-digital.ch'
  s.platforms      = { :ios => '15.1', :tvos => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  # Official Signal Messenger Swift client. Do not replace with custom crypto.
  s.dependency 'LibSignalClient', '0.100.0'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
