#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
MODE=${1:-device}
VERSION=${QUILL_VERSION:-1.0.0}
BUILD=${QUILL_BUILD:-1}
mkdir -p build
python3 scripts/bundle.py
swift make-icon.swift build/quill-icon.png
python3 - <<'PY'
import json,pathlib,subprocess
root=pathlib.Path('build/Assets.xcassets/AppIcon.appiconset');root.mkdir(parents=True,exist_ok=True)
images=[]
for idiom,points,scale in [('iphone',20,2),('iphone',20,3),('iphone',29,2),('iphone',29,3),('iphone',40,2),('iphone',40,3),('iphone',60,2),('iphone',60,3),('ipad',20,1),('ipad',20,2),('ipad',29,1),('ipad',29,2),('ipad',40,1),('ipad',40,2),('ipad',76,1),('ipad',76,2),('ipad',83.5,2),('ios-marketing',1024,1)]:
    pixels=int(points*scale); name=f'{idiom}-{pixels}.png'
    subprocess.run(['sips','-z',str(pixels),str(pixels),'build/quill-icon.png','--out',str(root/name)],check=True,stdout=subprocess.DEVNULL)
    images.append(dict(idiom=idiom,size=f'{points}x{points}',scale=f'{scale}x',filename=name))
(root/'Contents.json').write_text(json.dumps(dict(images=images,info=dict(version=1,author='xcode'))))
PY
if [ "$MODE" = simulator ]; then
  SDK=iphonesimulator
  TARGET="$(uname -m)-apple-ios16.0-simulator"
  APP=build/simulator/Quill.app
else
  SDK=iphoneos
  TARGET=arm64-apple-ios16.0
  APP=build/Payload/Quill.app
fi
rm -rf "$APP"
mkdir -p "$APP"
SDKPATH=$(xcrun --sdk "$SDK" --show-sdk-path)
xcrun --sdk "$SDK" swiftc -swift-version 5 -O -whole-module-optimization -parse-as-library -target "$TARGET" -sdk "$SDKPATH" -module-name Quill Sources/*.swift -o "$APP/Quill"
xcrun actool build/Assets.xcassets --compile "$APP" --platform "$SDK" --minimum-deployment-target 16.0 --app-icon AppIcon --output-partial-info-plist build/icon-info.plist --target-device iphone --target-device ipad
mkdir -p "$APP/Web"
cp docs/* "$APP/Web/"
python3 - "$APP" "$VERSION" "$BUILD" "$SDK" <<'PY'
import plistlib,pathlib,sys
app,version,build,sdk=sys.argv[1:]
info=dict(CFBundleDevelopmentRegion='en',CFBundleDisplayName='Quill',CFBundleExecutable='Quill',CFBundleIdentifier='com.kharrison.quill',CFBundleInfoDictionaryVersion='6.0',CFBundleName='Quill',CFBundlePackageType='APPL',CFBundleShortVersionString=version,CFBundleVersion=build,MinimumOSVersion='16.0',LSRequiresIPhoneOS=True,UIDeviceFamily=[1,2],UILaunchScreen={},UISupportedInterfaceOrientations=['UIInterfaceOrientationPortrait','UIInterfaceOrientationLandscapeLeft','UIInterfaceOrientationLandscapeRight'],LSSupportsOpeningDocumentsInPlace=True,ITSAppUsesNonExemptEncryption=False,CFBundleSupportedPlatforms=['iPhoneSimulator' if sdk=='iphonesimulator' else 'iPhoneOS'])
info.update(plistlib.loads(pathlib.Path('build/icon-info.plist').read_bytes()))
pathlib.Path(app,'Info.plist').write_bytes(plistlib.dumps(info))
PY
codesign --force --sign - "$APP"
if [ "$MODE" != simulator ]; then
  (cd build && zip -qry Quill.ipa Payload)
  echo "Built build/Quill.ipa"
fi
