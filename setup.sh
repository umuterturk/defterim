#!/bin/bash

# Defterim Setup Script
# This script automates the initial setup process

set -e  # Exit on error

echo "🚀 Setting up Defterim..."
echo ""

# Step 1: Install dependencies
echo "📦 Step 1/3: Installing dependencies..."
flutter pub get
echo "✅ Dependencies installed"
echo ""

# Step 2: Generate Hive adapter
echo "🔨 Step 2/3: Generating Hive adapter..."
flutter pub run build_runner build --delete-conflicting-outputs
echo "✅ Hive adapter generated"
echo ""

# Step 3: Firebase setup reminder
echo "🔥 Step 3/3: Firebase setup"
echo ""
echo "You need to configure Firebase. Choose one option:"
echo ""
echo "Option A (Recommended): Use FlutterFire CLI"
echo "  1. Install: dart pub global activate flutterfire_cli"
echo "  2. Run: flutterfire configure"
echo ""
echo "Option B: Manual setup"
echo "  1. Go to https://console.firebase.google.com/"
echo "  2. Create a project"
echo "  3. Add apps for iOS, Android, macOS"
echo "  4. Download config files"
echo "  5. Update lib/firebase_options.dart"
echo ""
echo "After Firebase setup:"
echo "  - Enable Firestore Database"
echo "  - Enable Anonymous Authentication"
echo "  - Set Firestore security rules (see SETUP.md)"
echo ""

# Check if flutterfire is installed
if command -v flutterfire &> /dev/null; then
    echo "✅ FlutterFire CLI is installed"
    echo ""
    read -p "Do you want to run 'flutterfire configure' now? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        flutterfire configure
        echo "✅ Firebase configured"
    fi
else
    echo "⚠️  FlutterFire CLI not found"
    echo "Install it with: dart pub global activate flutterfire_cli"
fi

echo ""
echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Make sure Firebase is configured (if not done above)"
echo "  2. Run: flutter run"
echo ""
echo "For detailed instructions, see SETUP.md"



