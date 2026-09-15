# Android SDK Setup Script (Linux/Mac)
# Run: bash setup-android-sdk.sh

SDK_PATH="$HOME/Library/Android/sdk"
CMDLINE_VERSION="11076708"
ANDROID_VERSION="34"

echo "==========================================="
echo " Android SDK Setup"
echo "==========================================="
echo ""

# Download cmdline-tools
mkdir -p "$SDK_PATH/cmdline-tools/latest/bin"
mkdir -p "$SDK_PATH/platform-tools"
mkdir -p "$SDK_PATH/platforms/android-$ANDROID_VERSION"
mkdir -p "$SDK_PATH/build-tools/34.0.0"

export ANDROID_HOME="$SDK_PATH"
export ANDROID_SDK_ROOT="$SDK_PATH"
export JAVA_HOME="$(dirname $(dirname $(readlink -f $(which java))))"

# Install platform tools and SDK components
echo "Installing SDK components..."
$SDK_PATH/cmdline-tools/latest/bin/sdkmanager --licenses
$SDK_PATH/cmdline-tools/latest/bin/sdkmanager \
  "platform-tools" \
  "platforms;android-$ANDROID_VERSION" \
  "build-tools;34.0.0" \
  "system-images;android-$ANDROID_VERSION;google_apis;x86_64"

echo "Android SDK installed at $SDK_PATH"
echo "Add to PATH: export PATH=\$PATH:\$ANDROID_HOME/platform-tools"