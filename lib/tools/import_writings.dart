// ignore_for_file: avoid_print
/// One-time import script to sync writings from out/ folder to Firestore
/// 
/// Run with: flutter run -d macos -t lib/tools/import_writings.dart
/// Or: flutter run -d chrome -t lib/tools/import_writings.dart

import 'dart:io';
import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../config/firebase_options.dart';

void main() {
  runApp(const ImportApp());
}

class ImportApp extends StatefulWidget {
  const ImportApp({super.key});

  @override
  State<ImportApp> createState() => _ImportAppState();
}

class _ImportAppState extends State<ImportApp> {
  String _status = 'Initializing...';
  int _imported = 0;
  int _total = 0;
  bool _isRunning = false;
  // ignore: unused_field
  bool _isComplete = false;
  final List<String> _logs = [];

  @override
  void initState() {
    super.initState();
    _initializeFirebase();
  }

  Future<void> _initializeFirebase() async {
    try {
      await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
      await FirebaseAuth.instance.signInAnonymously();
      setState(() {
        _status = 'Firebase initialized. Ready to import.';
      });
    } catch (e) {
      setState(() {
        _status = 'Firebase init error: $e';
      });
    }
  }

  void _log(String message) {
    print(message);
    setState(() {
      _logs.add(message);
      if (_logs.length > 50) {
        _logs.removeAt(0);
      }
    });
  }

  Future<void> _startImport() async {
    if (_isRunning) return;
    
    setState(() {
      _isRunning = true;
      _status = 'Starting import...';
      _logs.clear();
    });

    try {
      // Get the out folder path
      final outDir = Directory('out');
      if (!await outDir.exists()) {
        _log('ERROR: out/ folder not found. Make sure to run from project root.');
        setState(() {
          _isRunning = false;
          _status = 'Error: out/ folder not found';
        });
        return;
      }

      // Get all .txt files
      final files = await outDir.list().where((e) => e.path.endsWith('.txt')).toList();
      _total = files.length;
      _log('Found $_total .txt files to import');

      final firestore = FirebaseFirestore.instance;
      final writingsCollection = firestore.collection('writings');
      final metaCollection = firestore.collection('writings_meta');

      int successCount = 0;
      int skipCount = 0;
      int errorCount = 0;

      for (final entity in files) {
        if (entity is! File) continue;
        
        final file = entity;
        final fileName = file.path.split('/').last;
        final title = fileName.replaceAll('.txt', '');
        
        try {
          // Read content
          final content = await file.readAsString();
          
          // Create a unique ID based on title hash
          final id = title.hashCode.abs().toString();
          
          // Check if already exists
          final existingDoc = await metaCollection.doc(id).get();
          if (existingDoc.exists) {
            skipCount++;
            if (skipCount % 100 == 0) {
              _log('Skipped $skipCount existing writings...');
            }
            continue;
          }
          
          final now = DateTime.now();
          final preview = _generatePreview(content);
          
          // Upload to writings collection (full content)
          await writingsCollection.doc(id).set({
            'title': title,
            'body': content,
            'footer': '',
            'createdAt': now.toIso8601String(),
            'updatedAt': now.toIso8601String(),
            'isBold': false,
            'textAlign': 'left',
            'deletedAt': null,
          });
          
          // Upload to metadata collection (lightweight)
          await metaCollection.doc(id).set({
            'title': title,
            'preview': preview,
            'createdAt': now.toIso8601String(),
            'updatedAt': now.toIso8601String(),
            'deletedAt': null,
          });
          
          successCount++;
          setState(() {
            _imported = successCount;
            _status = 'Imported $successCount / $_total';
          });
          
          if (successCount % 50 == 0) {
            _log('Imported $successCount writings...');
          }
          
        } catch (e) {
          errorCount++;
          _log('Error importing "$title": $e');
        }
      }

      _log('');
      _log('========== IMPORT COMPLETE ==========');
      _log('Successfully imported: $successCount');
      _log('Skipped (already exists): $skipCount');
      _log('Errors: $errorCount');
      _log('Total processed: ${successCount + skipCount + errorCount}');
      
      setState(() {
        _isRunning = false;
        _isComplete = true;
        _status = 'Import complete! $successCount new, $skipCount skipped, $errorCount errors';
      });

    } catch (e) {
      _log('Import error: $e');
      setState(() {
        _isRunning = false;
        _status = 'Error: $e';
      });
    }
  }

  String _generatePreview(String body) {
    if (body.isEmpty) return '';
    
    String preview = body
        .replaceAll(RegExp(r'<[^>]*>'), '')
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&quot;', '"')
        .replaceAll('&#39;', "'")
        .replaceAll('&amp;', '&')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();
    
    return preview.length > 100 ? '${preview.substring(0, 100)}...' : preview;
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Import Writings',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.green),
      ),
      home: Scaffold(
        appBar: AppBar(
          title: const Text('Import Writings to Firestore'),
          backgroundColor: Colors.green,
          foregroundColor: Colors.white,
        ),
        body: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Status: $_status',
                        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 8),
                      if (_total > 0)
                        LinearProgressIndicator(
                          value: _total > 0 ? _imported / _total : 0,
                          minHeight: 10,
                        ),
                      const SizedBox(height: 8),
                      if (_total > 0)
                        Text('Progress: $_imported / $_total'),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
              ElevatedButton.icon(
                onPressed: _isRunning ? null : _startImport,
                icon: _isRunning 
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.upload),
                label: Text(_isRunning ? 'Importing...' : 'Start Import'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.green,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
                ),
              ),
              const SizedBox(height: 24),
              const Text(
                'Logs:',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              Expanded(
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.grey[900],
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: ListView.builder(
                    itemCount: _logs.length,
                    itemBuilder: (context, index) {
                      return Text(
                        _logs[index],
                        style: const TextStyle(
                          color: Colors.greenAccent,
                          fontFamily: 'monospace',
                          fontSize: 12,
                        ),
                      );
                    },
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

