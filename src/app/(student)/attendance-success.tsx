import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { CheckCircle, CloudOff, WifiOff, ShieldCheck } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { formatDate, formatTime } from '../../lib/dateUtils';

const ff = Platform.OS === 'android';

export default function AttendanceSuccessScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const { colors, isDark } = useTheme();
  const PRIMARY = colors.primary;
  const s = makeStyles(colors);

  const isOffline = params.isOffline === 'true';
  const displayDate = params.timestamp ? params.timestamp : new Date();

  return (
    <View style={[s.root, { paddingTop: Math.max(insets.top, 24), paddingBottom: Math.max(insets.bottom, 24) }]}>
      <StatusBar style={isDark ? "light" : "dark"} />
      
      <View style={[s.iconBlock, isOffline && { backgroundColor: isDark ? 'rgba(217, 119, 6, 0.18)' : '#FEF3C7' }]}>
        {isOffline ? (
          <CloudOff size={72} color={isDark ? '#F59E0B' : '#D97706'} />
        ) : (
          <CheckCircle size={80} color={PRIMARY} />
        )}
      </View>

      <Text style={s.title}>
        {isOffline ? 'Attendance Saved Offline!' : 'Attendance Recorded!'}
      </Text>
      <Text style={s.subtitle}>
        {isOffline
          ? 'No internet connection was detected in your lecture hall. Your attendance has been cryptographically sealed with your classroom GPS location and will sync automatically once online.'
          : 'Your attendance has been successfully marked and verified for this session.'}
      </Text>

      {isOffline && (
        <View style={s.offlineBanner}>
          <ShieldCheck size={18} color="#D97706" style={{ marginTop: 2, marginRight: 8 }} />
          <View style={{ flex: 1 }}>
            <Text style={s.offlineBannerTitle}>Tamper-Proof Seal Attached</Text>
            <Text style={s.offlineBannerText}>
              Your device fingerprint and classroom GPS fix are locked into this offline record.
            </Text>
          </View>
        </View>
      )}

      <View style={s.detailCard}>
        {[
          ...(params.courseCode ? [{ label: 'Course', value: String(params.courseCode) }] : []),
          { label: 'Date', value: formatDate(displayDate, { showDay: true, showYear: true }) },
          { label: 'Time', value: formatTime(displayDate) },
          { label: 'Verified Device', value: params.deviceName ? String(params.deviceName) : 'Single-Device Locked' },
          { label: 'Biometric Auth', value: params.biometricMethod ? `✓ ${params.biometricMethod}` : '✓ Fingerprint Verified' },
          {
            label: 'Status',
            value: isOffline ? '⚡ Pending Cloud Sync' : '✓ Present & Synced',
            highlight: isOffline ? '#D97706' : PRIMARY,
          },
        ].map((item) => (
          <View key={item.label} style={s.detailRow}>
            <Text style={s.detailLabel}>{item.label}</Text>
            <Text style={[s.detailValue, item.highlight ? { color: item.highlight } : undefined]}>
              {item.value}
            </Text>
          </View>
        ))}
      </View>

      <Pressable
        onPress={() => router.replace('/(student)')}
        style={[s.btn, isOffline && { backgroundColor: PRIMARY }]}
      >
        <Text style={s.btnText}>Back to Dashboard</Text>
      </Pressable>
    </View>
  );
}

function makeStyles(c: ReturnType<typeof import('../../context/ThemeContext').useTheme>['colors']) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
    iconBlock: { width: 120, height: 120, backgroundColor: c.primaryDim, borderRadius: 60, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
    title: { fontSize: 26, fontWeight: '700', color: c.text, marginBottom: 10, textAlign: 'center', fontFamily: ff ? 'sans-serif-medium' : undefined },
    subtitle: { fontSize: 14, color: c.textSub, textAlign: 'center', lineHeight: 21, marginBottom: 20, paddingHorizontal: 8, fontFamily: ff ? 'sans-serif' : undefined },
    offlineBanner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: '#FEF3C7',
      borderRadius: 14,
      padding: 12,
      borderWidth: 1,
      borderColor: '#FDE68A',
      marginBottom: 20,
      width: '100%',
    },
    offlineBannerTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: '#92400E',
      fontFamily: ff ? 'sans-serif-medium' : undefined,
    },
    offlineBannerText: {
      fontSize: 12,
      color: '#78350F',
      marginTop: 2,
      lineHeight: 17,
      fontFamily: ff ? 'sans-serif' : undefined,
    },
    detailCard: { width: '100%', backgroundColor: c.card, borderRadius: 18, padding: 20, borderWidth: 1, borderColor: c.cardBorder, marginBottom: 28 },
    detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.cardBorder },
    detailLabel: { fontSize: 14, color: c.textMuted, fontFamily: ff ? 'sans-serif' : undefined },
    detailValue: { fontSize: 14, fontWeight: '600', color: c.text, fontFamily: ff ? 'sans-serif-medium' : undefined },
    btn: { width: '100%', backgroundColor: c.primary, paddingVertical: 16, borderRadius: 999, alignItems: 'center', elevation: 2 },
    btnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 17, fontFamily: ff ? 'sans-serif-medium' : undefined },
  });
}

