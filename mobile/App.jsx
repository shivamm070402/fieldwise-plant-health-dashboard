import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Platform, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

const API_BASE = (process.env.EXPO_PUBLIC_API_BASE_URL || '').trim().replace(/\/+$/, '');

async function readResponse(response) {
  const body = await response.text();
  if (!body.trim()) {
    throw new Error(`The plant service returned an empty response (HTTP ${response.status}). Check that your backend is running and reachable.`);
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`The plant service returned an invalid response (HTTP ${response.status}).`);
  }
}

function formatApiDetail(detail) {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => {
      if (typeof item === 'string') return item;
      if (!item || typeof item !== 'object') return String(item);
      const location = Array.isArray(item.loc) ? `${item.loc.join('.')}: ` : '';
      return `${location}${item.msg || JSON.stringify(item)}`;
    }).join(' · ');
  }
  if (detail && typeof detail === 'object') return detail.message || detail.msg || JSON.stringify(detail);
  return '';
}

export default function App() {
  const [photo, setPhoto] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [service, setService] = useState('checking');
  const [firebaseReady, setFirebaseReady] = useState(false);

  const checkService = useCallback(async () => {
    if (!API_BASE || API_BASE.includes('your-deployed-backend')) {
      setService('configure');
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/api/health`);
      const data = await readResponse(response);
      setFirebaseReady(Boolean(data.firebase_ready));
      setService(response.ok && data.status === 'ready' ? 'ready' : 'limited');
    } catch {
      setService('offline');
    }
  }, []);

  useEffect(() => { void checkService(); }, [checkService]);

  async function detectImage(asset, imageSource = 'library') {
    if (!API_BASE || API_BASE.includes('your-deployed-backend')) {
      setError('Set EXPO_PUBLIC_API_BASE_URL in mobile/.env to your reachable FastAPI address, then restart Expo.');
      setService('configure');
      return;
    }
    setPhoto(asset);
    setResult(null);
    setError('');
    setBusy(true);
    try {
      const data = new FormData();
      data.append('file', {
        uri: asset.uri,
        name: asset.fileName || `fieldwise-${Date.now()}.jpg`,
        type: asset.mimeType || 'image/jpeg',
      });
      const response = await fetch(`${API_BASE}/api/predict`, { method: 'POST', body: data, headers: { Accept: 'application/json', 'X-Client-Platform': Platform.OS, ...(imageSource === 'camera' ? { 'X-Image-Source': 'camera' } : {}) } });
      const payload = await readResponse(response);
      if (!response.ok) throw new Error(formatApiDetail(payload?.detail) || `Plant scan failed (HTTP ${response.status}).`);
      setResult(payload);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Plant detection failed. Check your connection and retry.');
    } finally {
      setBusy(false);
    }
  }

  async function capturePhoto() {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Camera permission needed', 'Allow camera access in Settings to capture a plant photo.');
        return;
      }
      const capture = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.9 });
      if (!capture.canceled && capture.assets?.[0]) await detectImage(capture.assets[0], 'camera');
    } catch {
      setError('Could not open the camera. Please check camera permission and try again.');
    }
  }

  async function choosePhoto() {
    try {
      const selection = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.9 });
      if (!selection.canceled && selection.assets?.[0]) await detectImage(selection.assets[0]);
    } catch {
      setError('Could not open your photo library. Please try again.');
    }
  }

  const confidence = Math.max(0, Math.min(100, Number(result?.confidence || 0) * 100));
  const statusText = { checking: 'Checking service…', ready: 'Detection service online', limited: 'Model needs attention', offline: 'Service unreachable', configure: 'Backend address needed' }[service];

  return <SafeAreaView style={styles.safe}>
    <StatusBar barStyle="light-content" backgroundColor="#121912" />
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.topbar}>
        <View style={styles.brandMark}><Text style={styles.brandLeaf}>✳</Text></View>
        <View style={styles.brandCopy}><Text style={styles.brand}>FIELDWISE<Text style={styles.brandDot}>®</Text></Text><Text style={styles.brandSub}>PLANT HEALTH</Text></View>
        <TouchableOpacity style={styles.refreshButton} onPress={checkService} accessibilityLabel="Check backend status"><Text style={styles.refreshIcon}>↻</Text></TouchableOpacity>
      </View>

      <View style={styles.hero}>
        <Text style={styles.kicker}>FIELD INTELLIGENCE · MOBILE</Text>
        <Text style={styles.title}>Look closer.{ '\n' }<Text style={styles.titleAccent}>Grow forward.</Text></Text>
        <Text style={styles.subtitle}>Capture a clear photo of a plant leaf. Fieldwise screens the image and brings the result back to your phone.</Text>
        <View style={styles.statusRow}><View style={[styles.statusDot, service === 'ready' && styles.statusReady, service === 'offline' && styles.statusOffline]} /><Text style={styles.statusText}>{statusText}</Text></View>
        <Text style={styles.firebaseStatus}>{firebaseReady ? 'Firebase field-test storage connected' : 'Firebase field-test storage not configured'}</Text>
      </View>

      <View style={styles.scanPanel}>
        <View style={styles.panelHeading}><View><Text style={styles.sectionLabel}>01 — CAPTURE</Text><Text style={styles.panelTitle}>Check a plant</Text></View><Text style={styles.leafIcon}>✳</Text></View>
        {photo ? <Image source={{ uri: photo.uri }} style={styles.photo} resizeMode="cover" /> : <View style={styles.photoPlaceholder}><Text style={styles.placeholderGlyph}>⌁</Text><Text style={styles.placeholderTitle}>Ready for a leaf photo</Text><Text style={styles.placeholderText}>Use natural light and frame one leaf clearly.</Text></View>}
        <TouchableOpacity style={[styles.primaryButton, busy && styles.buttonDisabled]} onPress={capturePhoto} disabled={busy} accessibilityRole="button">
          {busy ? <ActivityIndicator color="#172012" /> : <Text style={styles.buttonIcon}>◉</Text>}
          <Text style={styles.primaryButtonText}>{busy ? 'Analyzing photo…' : 'Capture & detect'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={choosePhoto} disabled={busy} accessibilityRole="button"><Text style={styles.secondaryButtonText}>Choose from photos</Text></TouchableOpacity>
        {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}
      </View>

      <View style={styles.resultPanel}>
        <View style={styles.panelHeading}><View><Text style={styles.sectionLabel}>02 — RESULT</Text><Text style={styles.panelTitle}>Plant report</Text></View><Text style={styles.resultBadge}>{result ? 'READY' : 'WAITING'}</Text></View>
        {result ? <View style={styles.resultContent}>
          <Text style={styles.crop}>{String(result.crop || 'Plant').replaceAll('_', ' ')}</Text>
          <Text style={styles.disease}>{String(result.disease || 'Result unavailable').replaceAll('_', ' ')}</Text>
          <View style={styles.confidenceRow}><Text style={styles.confidenceLabel}>MODEL CONFIDENCE</Text><Text style={styles.confidenceValue}>{confidence.toFixed(1)}%</Text></View>
          <View style={styles.confidenceTrack}><View style={[styles.confidenceFill, { width: `${confidence}%` }]} /></View>
          <View style={[styles.healthPill, result.is_healthy ? styles.healthGood : styles.healthReview]}><Text style={styles.healthText}>{result.is_healthy ? 'Looks healthy' : 'Review symptoms'}</Text></View>
          <Text style={styles.storageStatus}>{result.firebase_saved ? 'Saved to Firebase mobile test collection' : 'Saved to backend history · Firebase is not connected'}</Text>
          {Array.isArray(result.advice) && result.advice.length ? <View style={styles.adviceList}>{result.advice.slice(0, 3).map((tip, index) => <Text style={styles.advice} key={`${index}-${tip}`}>•  {tip}</Text>)}</View> : null}
          <Text style={styles.disclaimer}>{result.disclaimer || 'AI screening only. Confirm uncertain or severe cases with a local agricultural professional.'}</Text>
        </View> : <View style={styles.emptyResult}><Text style={styles.emptyResultText}>{busy ? 'Your photo is being screened…' : 'Capture or choose a plant photo to see its screening result here.'}</Text></View>}
      </View>

      <Text style={styles.footer}>FIELDWISE · IMAGE SCREENING IS INFORMATIONAL</Text>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#121912' },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: 34 },
  topbar: { minHeight: 72, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#dce8d41f' },
  brandMark: { width: 38, height: 38, borderRadius: 20, borderWidth: 1, borderColor: '#bded7045', alignItems: 'center', justifyContent: 'center', backgroundColor: '#bded7011' },
  brandLeaf: { color: '#bded70', fontSize: 20 },
  brandCopy: { marginLeft: 10 },
  brand: { color: '#edf2e7', fontSize: 14, fontWeight: '800', letterSpacing: 1.6 },
  brandDot: { color: '#bded70', fontSize: 9 },
  brandSub: { marginTop: 2, color: '#87937f', fontSize: 8, letterSpacing: 1.4 },
  refreshButton: { width: 38, height: 38, marginLeft: 'auto', alignItems: 'center', justifyContent: 'center', borderRadius: 20, borderWidth: 1, borderColor: '#dce8d42c' },
  refreshIcon: { color: '#bded70', fontSize: 22 },
  hero: { paddingTop: 32, paddingBottom: 24 },
  kicker: { color: '#b9ce9f', fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  title: { marginTop: 15, color: '#edf2e7', fontSize: 44, fontWeight: '600', letterSpacing: -2.3, lineHeight: 48 },
  titleAccent: { color: '#bded70', fontStyle: 'italic', fontWeight: '400' },
  subtitle: { maxWidth: 460, marginTop: 14, color: '#a5b19f', fontSize: 14, lineHeight: 22 },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 18 },
  statusDot: { width: 8, height: 8, marginRight: 8, borderRadius: 5, backgroundColor: '#d7a74e' },
  statusReady: { backgroundColor: '#bded70' },
  statusOffline: { backgroundColor: '#e27d69' },
  statusText: { color: '#aebba7', fontSize: 11 },
  firebaseStatus: { marginTop: 8, color: '#85927e', fontSize: 10 },
  scanPanel: { padding: 17, borderRadius: 18, borderWidth: 1, borderColor: '#dce8d425', backgroundColor: '#1b251c' },
  panelHeading: { minHeight: 43, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  sectionLabel: { color: '#96a78a', fontSize: 9, fontWeight: '700', letterSpacing: 1.4 },
  panelTitle: { marginTop: 4, color: '#e8efdf', fontSize: 19, fontWeight: '600', letterSpacing: -0.4 },
  leafIcon: { color: '#bded70', fontSize: 20 },
  photo: { width: '100%', height: 260, borderRadius: 13, backgroundColor: '#111911' },
  photoPlaceholder: { height: 230, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: '#bded7040', borderRadius: 13, backgroundColor: '#172119' },
  placeholderGlyph: { color: '#bded70', fontSize: 35 },
  placeholderTitle: { marginTop: 8, color: '#e0e8d9', fontSize: 14, fontWeight: '600' },
  placeholderText: { marginTop: 6, color: '#9ba997', fontSize: 11 },
  primaryButton: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 14, borderRadius: 28, backgroundColor: '#bded70' },
  buttonDisabled: { opacity: 0.75 },
  buttonIcon: { color: '#172012', fontSize: 20 },
  primaryButtonText: { color: '#172012', fontSize: 14, fontWeight: '700' },
  secondaryButton: { minHeight: 43, alignItems: 'center', justifyContent: 'center', marginTop: 8, borderWidth: 1, borderColor: '#bded7040', borderRadius: 24 },
  secondaryButtonText: { color: '#c6dcab', fontSize: 12, fontWeight: '600' },
  errorBox: { marginTop: 12, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#e88c6f4a', backgroundColor: '#852f2026' },
  errorText: { color: '#ffd4c6', fontSize: 12, lineHeight: 18 },
  resultPanel: { marginTop: 14, padding: 17, borderRadius: 18, borderWidth: 1, borderColor: '#dce8d425', backgroundColor: '#1b251c' },
  resultBadge: { paddingHorizontal: 10, paddingVertical: 6, overflow: 'hidden', borderRadius: 20, color: '#bded70', backgroundColor: '#bded7016', fontSize: 9, fontWeight: '700', letterSpacing: 0.7 },
  resultContent: { paddingTop: 8 },
  crop: { color: '#9cae91', fontSize: 11, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' },
  disease: { marginTop: 6, color: '#eff4e9', fontSize: 24, fontWeight: '600', letterSpacing: -0.5 },
  confidenceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 19 },
  confidenceLabel: { color: '#9ba997', fontSize: 9, fontWeight: '700', letterSpacing: 1.1 },
  confidenceValue: { color: '#bded70', fontSize: 14, fontWeight: '700' },
  confidenceTrack: { height: 6, marginTop: 8, overflow: 'hidden', borderRadius: 4, backgroundColor: '#ffffff1a' },
  confidenceFill: { height: 6, borderRadius: 4, backgroundColor: '#bded70' },
  healthPill: { alignSelf: 'flex-start', marginTop: 14, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 16 },
  healthGood: { backgroundColor: '#bded701c' },
  healthReview: { backgroundColor: '#eeaa4d1c' },
  healthText: { color: '#dcebc8', fontSize: 11, fontWeight: '600' },
  storageStatus: { marginTop: 12, color: '#9ba997', fontSize: 10, lineHeight: 16 },
  adviceList: { gap: 8, marginTop: 16 },
  advice: { color: '#c0cbb9', fontSize: 12, lineHeight: 18 },
  disclaimer: { marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#ffffff1b', color: '#97a392', fontSize: 10, lineHeight: 16 },
  emptyResult: { minHeight: 82, justifyContent: 'center' },
  emptyResultText: { color: '#9ba997', fontSize: 12, lineHeight: 19 },
  footer: { marginTop: 20, color: '#768373', fontSize: 9, letterSpacing: 1, textAlign: 'center' },
});
