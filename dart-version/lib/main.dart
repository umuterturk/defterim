import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'services/local_storage_service.dart';
import 'services/firebase_sync_service.dart';
import 'screens/writings_list_screen.dart';
import 'config/firebase_options.dart';

void main() {
  runApp(const DefterimApp());
}

class DefterimApp extends StatefulWidget {
  const DefterimApp({super.key});

  @override
  State<DefterimApp> createState() => _DefterimAppState();
}

class _DefterimAppState extends State<DefterimApp> {
  bool _isInitialized = false;

  @override
  void initState() {
    super.initState();
    _initialize();
  }

  Future<void> _initialize() async {
    await LocalStorageService.instance.initialize();
    
    try {
      // Check if Firebase is properly configured for this platform
      final options = DefaultFirebaseOptions.currentPlatform;
      final hasNoPlaceholders =
          !options.apiKey.startsWith('YOUR_') && !options.appId.startsWith('YOUR_');

      // Check if the appId matches the platform
      // IMPORTANT: Check kIsWeb first, since defaultTargetPlatform returns the host OS even on web
      final bool isPlatformAppIdMatch;
      if (kIsWeb) {
        isPlatformAppIdMatch = options.appId.contains(':web:');
      } else {
        isPlatformAppIdMatch = switch (defaultTargetPlatform) {
          TargetPlatform.iOS || TargetPlatform.macOS => options.appId.contains(':ios:'),
          TargetPlatform.android => options.appId.contains(':android:'),
          TargetPlatform.windows || TargetPlatform.linux => options.appId.contains(':web:'),
          _ => true,
        };
      }

      final isConfigured = hasNoPlaceholders && isPlatformAppIdMatch;
      final platformName = kIsWeb ? 'web' : defaultTargetPlatform.name;
      
      if (isConfigured) {
        await Firebase.initializeApp(options: options);
        await FirebaseSyncService.instance.initialize();
      } else {
        debugPrint(
          'Firebase not configured (or mismatched appId) for $platformName. '
          'Run: flutterfire configure',
        );
      }
    } catch (e) {
      debugPrint('Firebase initialization failed: $e');
    }
    
    await initializeDateFormatting('tr_TR', null);
    
    await SystemChrome.setPreferredOrientations([
      DeviceOrientation.portraitUp,
      DeviceOrientation.portraitDown,
    ]);
    
    setState(() {
      _isInitialized = true;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (!_isInitialized) {
      return MaterialApp(
        debugShowCheckedModeBanner: false,
        home: Scaffold(
          backgroundColor: const Color(0xFFF5F5F0),
          body: Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const CircularProgressIndicator(
                  color: Color(0xFF4A7C59),
                  strokeWidth: 4,
                ),
                const SizedBox(height: 32),
                Text(
                  'YÜKLENİYOR...',
                  style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w600,
                    color: Colors.grey[700],
                    letterSpacing: 2,
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }
    
    return MaterialApp(
      title: 'Defterim',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        // High contrast, large fonts for elderly users
        primaryColor: const Color(0xFF4A7C59),
        scaffoldBackgroundColor: const Color(0xFFF5F5F0),
        fontFamily: 'System',
        
        // Large text scale for better readability
        textTheme: const TextTheme(
          bodyLarge: TextStyle(fontSize: 20),
          bodyMedium: TextStyle(fontSize: 18),
        ),
        
        // Larger touch targets
        materialTapTargetSize: MaterialTapTargetSize.padded,
        
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF4A7C59),
          brightness: Brightness.light,
        ),
      ),
      home: const WritingsListScreen(),
    );
  }
}
