#!/bin/bash
set -e
cd "$(dirname "$0")"
if ! xcodebuild -version >/dev/null 2>&1; then
  printf '%s\n' 'Zainstaluj i otwórz Xcode, aby dokończyć jego konfigurację.'
  exit 1
fi
if ! command -v node >/dev/null || ! node -e 'process.exit(+process.versions.node.split(".")[0]<22?1:0)'; then
  printf '%s\n' 'Zainstaluj Node.js 22 lub nowszy z https://nodejs.org/ i otwórz ten plik ponownie.'
  exit 1
fi
npm ci
npm run mobile:build
npx --no-install cap sync ios
open ios/App/App.xcodeproj
