# Defterim

A beautiful, cross-platform note-taking app built with Flutter. Write your thoughts anywhere, sync them everywhere.

![Flutter](https://img.shields.io/badge/Flutter-02569B?style=for-the-badge&logo=flutter&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)
![Platforms](https://img.shields.io/badge/Platforms-Android%20%7C%20iOS%20%7C%20macOS%20%7C%20Windows%20%7C%20Linux%20%7C%20Web-blue?style=for-the-badge)

## Features

- ✍️ **Distraction-free Writing** - Clean, minimal editor focused on your content
- 🔄 **Automatic Cloud Sync** - Your writings sync across all your devices via Firebase
- 📱 **Cross-Platform** - Works on Android, iOS, macOS, Windows, Linux, and Web
- 💾 **Offline Support** - Write anytime, sync when you're back online
- 🎨 **Beautiful UI** - Modern Material Design with a focus on readability

## Getting Started

### Prerequisites

- [Flutter SDK](https://flutter.dev/docs/get-started/install) (3.2.0 or higher)
- [Firebase CLI](https://firebase.google.com/docs/cli) (for cloud sync features)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/umuterturk/defterim.git
   cd defterim
   ```

2. Install dependencies:
   ```bash
   flutter pub get
   ```

3. Run the app:
   ```bash
   # Run on connected device/emulator
   flutter run
   
   # Run on Chrome (Web)
   flutter run -d chrome
   
   # Run on macOS
   flutter run -d macos
   ```

### Firebase Setup (Optional)

For cloud sync functionality:

1. Create a Firebase project at [Firebase Console](https://console.firebase.google.com)
2. Enable Firestore Database and Authentication
3. Run the setup script:
   ```bash
   ./setup.sh
   ```

## Building for Release

### Android
```bash
flutter build apk --release
flutter build appbundle --release
```

### iOS
```bash
flutter build ios --release
```

### macOS
```bash
flutter build macos --release
```

### Windows
```bash
flutter build windows --release
```

### Linux
```bash
flutter build linux --release
```

### Web
```bash
flutter build web --release
```

## Project Structure

```
lib/
├── config/           # App configuration (Firebase, etc.)
├── models/           # Data models (Writing, WritingMetadata)
├── screens/          # UI screens (Editor, Writings List)
├── services/         # Business logic (Storage, Sync)
├── utils/            # Utility functions
└── widgets/          # Reusable UI components
```

## Release

Releases are automatically built for all platforms when a new version tag is pushed:

```bash
git tag v1.0.0
git push origin v1.0.0
```

The GitHub Actions workflow will automatically:
- Build executables for Android (APK, AAB), iOS, macOS, Windows, Linux, and Web
- Create a GitHub Release with all artifacts

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**Defterim** means "my notebook" in Turkish 📓

