# Flutter Developer Integration Guide: Attender App

This guide maps the existing web CRM's React/Firebase logic into **Dart/Flutter** code. It outlines models, utility functions, Firestore transactions, and native launcher code.

---

## 1. Firebase Packages Needed
Add these dependencies to your Flutter `pubspec.yaml`:

```yaml
dependencies:
  flutter:
    sdk: flutter
  firebase_core: ^3.0.0      # Or latest
  cloud_firestore: ^5.0.0    # Or latest
  url_launcher: ^6.2.0       # For Native Dialer launcher
```

---

## 2. Shared Data Models in Dart

These models capture the structure of contacts, history logs, and the database schema.

### A. Call History Item Model
```dart
class HistoryItem {
  final String status;
  final String remark;
  final String attenderName;
  final DateTime timestamp;

  HistoryItem({
    required this.status,
    required this.remark,
    required this.attenderName,
    required this.timestamp,
  });

  factory HistoryItem.fromMap(Map<String, dynamic> map) {
    DateTime parseTime(dynamic t) {
      if (t == null) return DateTime.now();
      if (t is String) return DateTime.tryParse(t) ?? DateTime.now();
      // Handle Firestore Timestamp
      return (t as dynamic).toDate();
    }

    return HistoryItem(
      status: map['status'] ?? '',
      remark: map['remark'] ?? '',
      attenderName: map['attenderName'] ?? 'Unknown',
      timestamp: parseTime(map['timestamp']),
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'status': status,
      'remark': remark,
      'attenderName': attenderName,
      'timestamp': timestamp.toIso8601String(), // Or Timestamp.fromDate(timestamp) depending on Firestore structure
    };
  }
}
```

### B. Contact Model
```dart
class ContactModel {
  final String id;
  final String name;
  final String phone;
  final String mobile;
  final String email;
  final String city;
  final String state;
  final String khoji;
  final List<String> tags;
  final String source;
  final String calledFor;
  final String callType;
  final String status;
  final String remark;
  final String objectionReason;
  final List<HistoryItem> history;
  final DateTime? callbackDate;
  final String? callbackStatus;
  final bool isHotLead;
  final bool isAssigned;
  final String? assignedTo;
  final String? assignedName;
  final String normalizedPhone;
  final String? registeredYearMonth;
  final List<String> mappedFields;
  final bool deleted;

  ContactModel({
    required this.id,
    required this.name,
    required this.phone,
    required this.mobile,
    required this.email,
    required this.city,
    required this.state,
    required this.khoji,
    required this.tags,
    required this.source,
    required this.calledFor,
    required this.callType,
    required this.status,
    required this.remark,
    required this.objectionReason,
    required this.history,
    this.callbackDate,
    this.callbackStatus,
    required this.isHotLead,
    required this.isAssigned,
    this.assignedTo,
    this.assignedName,
    required this.normalizedPhone,
    this.registeredYearMonth,
    required this.mappedFields,
    required this.deleted,
  });

  factory ContactModel.fromFirestore(String docId, Map<String, dynamic> data) {
    // Standardize field lookup (case-insensitive keys mapping)
    String getVal(List<String> keys) {
      for (var k in keys) {
        if (data.containsKey(k) && data[k] != null) {
          return data[k].toString().trim();
        }
      }
      return '';
    }

    // Merge legacy tags (from string & array)
    Set<String> tagsSet = {};
    if (data['tags'] is List) {
      tagsSet.addAll(List<String>.from(data['tags']));
    }
    final rawTagsString = getVal(['Tags', 'tags', 'tag']);
    if (rawTagsString.isNotEmpty) {
      rawTagsString.split(',').map((e) => e.trim()).where((e) => e.isNotEmpty).forEach(tagsSet.add);
    }

    // Read history logs
    List<HistoryItem> histList = [];
    if (data['history'] is List) {
      histList = (data['history'] as List)
          .map((h) => HistoryItem.fromMap(Map<String, dynamic>.from(h)))
          .toList();
    }

    DateTime? parseDate(dynamic d) {
      if (d == null) return null;
      if (d is String) return DateTime.tryParse(d);
      return (d as dynamic).toDate(); // Firestore Timestamp conversion
    }

    return ContactModel(
      id: docId,
      name: getVal(['Name', 'caller', 'caller name', 'lead name', 'lead']),
      phone: getVal(['Phone', 'phone number', 'whatsapp', 'contact']),
      mobile: getVal(['Mobile', 'mobile no', 'mobile number']),
      email: getVal(['Email', 'mail', 'e-mail']),
      city: getVal(['City', 'location', 'place']),
      state: getVal(['State', 'province', 'region']),
      khoji: getVal(['Khoji', 'khoji yes or no']),
      tags: tagsSet.toList()..sort(),
      source: getVal(['Source', 'sourse']),
      calledFor: getVal(['Called For', 'called_for', 'calledfor']),
      callType: data['callType'] ?? 'outgoing',
      status: data['status'] ?? '',
      remark: data['remark'] ?? '',
      objectionReason: data['objectionReason'] ?? '',
      history: histList,
      callbackDate: parseDate(data['callbackDate']),
      callbackStatus: data['callbackStatus'],
      isHotLead: data['isHotLead'] ?? false,
      isAssigned: data['isAssigned'] ?? false,
      assignedTo: data['assignedTo'],
      assignedName: data['assignedName'],
      normalizedPhone: data['normalizedPhone'] ?? '',
      registeredYearMonth: data['registeredYearMonth'],
      mappedFields: List<String>.from(data['_mappedFields'] ?? []),
      deleted: data['_deleted'] ?? false,
    );
  }
}
```

---

## 3. Business Logic (Utility Helpers)

### A. Phone Number Normalization
Must match the web app's algorithm to allow duplicate matches:
```dart
String normalizePhone(String phone) {
  if (phone.isEmpty) return "";
  // Strip spaces, dashes, periods, parentheses, and plus sign
  final cleaned = phone.replaceAll(RegExp(r'[\s\-.\(\)\+]'), '').trim();
  if (cleaned.length >= 10) {
    // Return only the last 10 digits
    return cleaned.substring(cleaned.length - 10);
  }
  return cleaned;
}
```

### B. Khoji Status Checks
Translates affirmative and negative responses into standardized formats:
```dart
bool isKhojiAffirmative(String val) {
  final v = val.toLowerCase().trim();
  if (v.isEmpty) return false;
  return v == 'yes' ||
      v == 'y' ||
      v == 'true' ||
      v == 'khoji' ||
      v.startsWith('yes') ||
      v.startsWith('y ') ||
      v.startsWith('y/') ||
      v.contains('हां') ||
      v.contains('हाँ') ||
      v.contains('done') ||
      v.contains('completed');
}

bool isKhojiNegative(String val) {
  final v = val.toLowerCase().trim();
  if (v.isEmpty) return false;
  return v == 'no' ||
      v == 'n' ||
      v == 'false' ||
      v.startsWith('no') ||
      v.startsWith('n ') ||
      v.startsWith('n/') ||
      v.contains('ना') ||
      v.contains('नहीं') ||
      v.contains('नही') ||
      v.contains('not');
}
```

---

## 4. Firestore Operations (Dart & Firebase Package)

These functions connect directly to Firestore data.

### A. Fetch Assigned Contact Stream (Real-Time Subscription)
```dart
import 'package:cloud_firestore/cloud_firestore.dart';

Stream<List<ContactModel>> subscribeToAssignedContacts(String attenderId) {
  final FirebaseFirestore firestore = FirebaseFirestore.instance;

  return firestore
      .collection('contacts')
      .where('assignedTo', isEqualTo: attenderId)
      .snapshots()
      .map((snapshot) {
    final contacts = snapshot.docs
        .map((doc) => ContactModel.fromFirestore(doc.id, doc.data()))
        .where((contact) => !contact.deleted)
        .toList();

    // Sort: Due callbacks first, then others
    final today = DateTime.now();
    final todayZero = DateTime(today.year, today.month, today.day);

    final overdueCallbacks = <ContactModel>[];
    final rest = <ContactModel>[];

    for (var contact in contacts) {
      if (contact.callbackDate != null) {
        final cbDateZero = DateTime(
          contact.callbackDate!.year,
          contact.callbackDate!.month,
          contact.callbackDate!.day,
        );
        if (cbDateZero.isBefore(todayZero) || cbDateZero.isAtSameMomentAs(todayZero)) {
          overdueCallbacks.add(contact);
          continue;
        }
      }
      rest.add(contact);
    }
    return [...overdueCallbacks, ...rest];
  });
}
```

### B. Pull Contact Numbers from Tag Pool (Transaction Safeguarded)
Ensures attenders do not pull the same contact simultaneously:
```dart
Future<int> assignContactsToAttender({
  required String tag,
  required String attenderId,
  required String attenderName,
  required int count,
}) async {
  final firestore = FirebaseFirestore.instance;

  // 1. Fetch tags candidates
  final querySnapshot = await firestore
      .collection('contacts')
      .where('tags', arrayContains: tag)
      .limit(1000) // limit search scope client-side
      .get();

  if (querySnapshot.docs.isEmpty) return 0;

  // Filter client-side for unassigned and non-deleted
  final candidates = querySnapshot.docs.where((doc) {
    final data = doc.data();
    final isAssigned = data['isAssigned'] ?? false;
    final deleted = data['_deleted'] ?? false;
    return !isAssigned && !deleted;
  }).take(count).toList();

  if (candidates.isEmpty) return 0;

  // 2. Execute Transaction
  final totalAssigned = await firestore.runTransaction<int>((transaction) async {
    int localCount = 0;
    
    // Fetch fresh snapshots inside transaction (Reads must precede writes)
    final freshSnaps = <DocumentSnapshot>[];
    for (var candidate in candidates) {
      final fresh = await transaction.get(candidate.reference);
      freshSnaps.add(fresh);
    }

    // Apply updates inside transaction
    for (var fresh in freshSnaps) {
      if (!fresh.exists) continue;
      final data = fresh.data() as Map<String, dynamic>;
      final isAssigned = data['isAssigned'] ?? false;

      if (!isAssigned) {
        transaction.update(fresh.reference, {
          'isAssigned': true,
          'assignedTo': attenderId,
          'assignedName': attenderName,
          'attenderId': attenderId,     // backward compat
          'attenderName': attenderName, // backward compat
          'callType': 'outgoing',
          'assignedAt': FieldValue.serverTimestamp(),
          'updatedAt': FieldValue.serverTimestamp(),
        });
        localCount++;
      }
    }
    return localCount;
  });

  return totalAssigned;
}
```

### C. Save Contact Call Log & Register Abhivyakti Done
Handles saving notes, appending to call history, and updating registrations:
```dart
Future<void> updateCallLog({
  required String docId,
  required Map<String, dynamic> updates,
  required String attenderName,
  required String previousStatus,
}) async {
  final firestore = FirebaseFirestore.instance;
  final contactRef = firestore.collection('contacts').doc(docId);

  // Normalize phone if changed
  final phoneFields = ['Phone', 'Mobile', 'phone', 'whatsapp'];
  final updatedKey = updates.keys.firstWhere(
    (k) => phoneFields.contains(k) || k.toLowerCase().contains('phone'),
    orElse: () => '',
  );
  if (updatedKey.isNotEmpty) {
    updates['normalizedPhone'] = normalizePhone(updates[updatedKey].toString());
  }

  // Handle Abhivyakti Report writes for status logic
  final newStatus = updates['status'] ?? '';
  final now = DateTime.now();
  final yearMonth = '${now.year}-${now.month.toString().padLeft(2, '0')}';

  if (newStatus == 'Reg.Done') {
    updates['registeredYearMonth'] = yearMonth;
  }

  updates['updatedAt'] = FieldValue.serverTimestamp();

  // Save the contact update
  await contactRef.set(updates, SetOptions(merge: true));

  // Sync to separate collections based on status transitions
  if (newStatus == 'Reg.Done') {
    final freshDoc = await contactRef.get();
    final freshData = freshDoc.data() ?? {};

    // Remove undefined/nulls prior to Firestore write
    final registrationPayload = Map<String, dynamic>.from(freshData)
      ..addAll({
        'id': docId,
        'registeredYearMonth': yearMonth,
        'registeredAt': FieldValue.serverTimestamp(),
        'conversionSource': freshData['Source'] ?? 'Direct',
        'convertedBy': freshData['assignedName'] ?? attenderName,
        'programName': freshData['programName'] ?? 'Unknown',
      });

    await firestore.collection('registrations').doc(docId).set(registrationPayload, SetOptions(merge: true));
  } else if (previousStatus == 'Reg.Done' && newStatus != 'Reg.Done') {
    // Delete from registration report if status reverted
    await firestore.collection('registrations').doc(docId).delete();
    await contactRef.update({'registeredYearMonth': FieldValue.delete()});
  }
}
```

---

## 5. Global Search & Claim Logic

Allows attenders to look up leads across the CRM database and reassign them to themselves.

```dart
Future<void> claimContact({
  required String docId,
  required String attenderId,
  required String attenderName,
}) async {
  final firestore = FirebaseFirestore.instance;
  await firestore.collection('contacts').doc(docId).update({
    'isAssigned': true,
    'assignedTo': attenderId,
    'assignedName': attenderName,
    'attenderId': attenderId,
    'attenderName': attenderName,
    'callType': 'outgoing',
    'assignedAt': FieldValue.serverTimestamp(),
    'updatedAt': FieldValue.serverTimestamp(),
  });
}
```

---

## 6. Native Dialer Launcher Service

To launch the native phone dialer interface on iOS/Android:

```dart
import 'package:url_launcher/url_launcher.dart';

class PhoneDialerService {
  static Future<void> launchDialer(String phoneNumber) async {
    // Strip empty spaces/formatting
    final cleanPhone = phoneNumber.replaceAll(RegExp(r'\s+'), '');
    final Uri telScheme = Uri(scheme: 'tel', path: cleanPhone);
    
    if (await canLaunchUrl(telScheme)) {
      await launchUrl(telScheme);
    } else {
      throw 'Could not open the native dialer application for $cleanPhone';
    }
  }
}
```

*Implementation note: Add this to your onTap handlers on the contact detail screen:*
```dart
onTap: () async {
  try {
    await PhoneDialerService.launchDialer(contact.phone);
  } catch (e) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(e.toString())),
    );
  }
}
```
