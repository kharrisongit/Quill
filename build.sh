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
  QUILL_ARCH=$(uname -m)
  APP=build/simulator/Quill.app
  DESTINATION='generic/platform=iOS Simulator'
else
  SDK=iphoneos
  QUILL_ARCH=arm64
  APP=build/Payload/Quill.app
  DESTINATION='generic/platform=iOS'
fi
mkdir -p build/Web
cp docs/* build/Web/
python3 - build "$VERSION" "$BUILD" "$SDK" <<'PY'
import plistlib,pathlib,sys
app,version,build,sdk=sys.argv[1:]
info=dict(CFBundleDevelopmentRegion='en',CFBundleDisplayName='Quill',CFBundleExecutable='Quill',CFBundleIdentifier='com.kharrison.quill',CFBundleInfoDictionaryVersion='6.0',CFBundleName='Quill',CFBundlePackageType='APPL',CFBundleShortVersionString=version,CFBundleVersion=build,MinimumOSVersion='16.0',LSRequiresIPhoneOS=True,UIDeviceFamily=[1,2],UILaunchScreen={},UISupportedInterfaceOrientations=['UIInterfaceOrientationPortrait','UIInterfaceOrientationLandscapeLeft','UIInterfaceOrientationLandscapeRight'],LSSupportsOpeningDocumentsInPlace=True,ITSAppUsesNonExemptEncryption=False,CFBundleSupportedPlatforms=['iPhoneSimulator' if sdk=='iphonesimulator' else 'iPhoneOS'])

pathlib.Path(app,'Info.plist').write_bytes(plistlib.dumps(info))
PY
xcodegen generate --spec project.yml
xcodebuild -project Quill.xcodeproj -scheme Quill -configuration Release -sdk "$SDK" \
  -destination "$DESTINATION" -derivedDataPath build/DerivedData \
  -clonedSourcePackagesDirPath build/Packages CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO \
  ONLY_ACTIVE_ARCH=YES ARCHS="$QUILL_ARCH" build
rm -rf "$APP"
mkdir -p "$(dirname "$APP")"
cp -R "build/DerivedData/Build/Products/Release-$SDK/Quill.app" "$APP"
codesign --force --sign - "$APP"
if [ "$MODE" != simulator ]; then
  (cd build && zip -qry Quill.ipa Payload)
  echo "Built build/Quill.ipa"
fi
