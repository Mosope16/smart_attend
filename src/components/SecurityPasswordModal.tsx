import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
  Switch,
} from 'react-native';
import {
  Lock,
  Eye,
  EyeOff,
  ShieldCheck,
  CheckCircle,
  AlertCircle,
  X,
  KeyRound,
  Smartphone,
} from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { FingerprintIcon } from './FingerprintIcon';
import {
  getBiometricCapabilities,
  isBiometricEnabled,
  setBiometricEnabled,
  authenticateWithBiometrics,
  BiometricCapabilities,
} from '../lib/biometrics';

const ff = Platform.OS === 'android';

interface SecurityPasswordModalProps {
  visible: boolean;
  onClose: () => void;
  accentColor?: string;
  role?: 'student' | 'lecturer';
}

export default function SecurityPasswordModal({
  visible,
  onClose,
  accentColor,
  role = 'student',
}: SecurityPasswordModalProps) {
  const { colors, isDark } = useTheme();
  const { changePassword } = useAuth();
  const themeAccent = accentColor || (role === 'lecturer' ? colors.secondary : colors.primary);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Password visibility states
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [biometricEnabled, setBiometricEnabledState] = useState(false);
  const [biometricCaps, setBiometricCaps] = useState<BiometricCapabilities | null>(null);
  const [bioTesting, setBioTesting] = useState(false);
  const [bioFeedback, setBioFeedback] = useState<string | null>(null);

  React.useEffect(() => {
    if (visible) {
      getBiometricCapabilities().then((caps) => {
        setBiometricCaps(caps);
      });
      isBiometricEnabled().then((enabled) => {
        setBiometricEnabledState(enabled);
      });
      setBioFeedback(null);
    }
  }, [visible]);

  const handleToggleBiometrics = async (val: boolean) => {
    setBioFeedback(null);
    if (val) {
      if (!biometricCaps?.isAvailable) {
        setBioFeedback('No biometric hardware or enrolled fingerprint found on this device.');
        return;
      }
      setBioTesting(true);
      const res = await authenticateWithBiometrics({
        promptMessage: 'Scan fingerprint to enable biometric protection',
      });
      setBioTesting(false);
      if (res.success) {
        await setBiometricEnabled(true);
        setBiometricEnabledState(true);
        setBioFeedback('✓ Fingerprint verification enabled successfully!');
      } else {
        setBioFeedback(res.error || 'Verification cancelled or failed.');
      }
    } else {
      await setBiometricEnabled(false);
      setBiometricEnabledState(false);
      setBioFeedback('Biometric authentication disabled.');
    }
  };

  const handleTestSensor = async () => {
    setBioFeedback(null);
    setBioTesting(true);
    const res = await authenticateWithBiometrics({
      promptMessage: `Testing ${biometricCaps?.biometricLabel || 'Fingerprint'} Sensor`,
    });
    setBioTesting(false);
    if (res.success) {
      setBioFeedback('✓ Sensor test successful: Fingerprint verified!');
    } else {
      setBioFeedback(res.error || 'Sensor test unsuccessful.');
    }
  };

  const resetForm = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
    setError(null);
    setSuccess(null);
    setBioFeedback(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    setError(null);
    setSuccess(null);

    if (!currentPassword.trim()) {
      setError('Please enter your current password.');
      return;
    }
    if (!newPassword.trim()) {
      setError('Please enter your new password.');
      return;
    }
    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('New password must be different from your current password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await changePassword({
        currentPassword: currentPassword.trim(),
        newPassword: newPassword.trim(),
      });

      if (!res.success) {
        setError(res.error || 'Failed to update password. Please check your current password.');
      } else {
        setSuccess('Password updated successfully! Your account is secure.');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch (e: any) {
      setError(e?.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const s = makeStyles(colors, themeAccent, isDark);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={s.backdrop}>
            <Pressable style={s.scrim} onPress={handleClose} />
            <View style={s.sheet}>
              {/* Header */}
              <View style={s.header}>
                <View style={s.headerLeft}>
                  <View style={[s.iconBox, { backgroundColor: themeAccent + '18' }]}>
                    <KeyRound size={22} color={themeAccent} />
                  </View>
                  <View>
                    <Text style={s.headerTitle}>Security & Password</Text>
                    <Text style={s.headerSub}>Manage your account credentials</Text>
                  </View>
                </View>
                <Pressable onPress={handleClose} style={s.closeBtn} hitSlop={10}>
                  <X size={20} color={colors.textMuted} />
                </Pressable>
              </View>

              <ScrollView
                style={s.scroll}
                contentContainerStyle={s.scrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {/* Status Messages */}
                {Boolean(error) && (
                  <View style={s.errorBox}>
                    <AlertCircle size={18} color={colors.danger} style={{ marginRight: 8 }} />
                    <Text style={s.errorText}>{error}</Text>
                  </View>
                )}

                {Boolean(success) && (
                  <View style={s.successBox}>
                    <CheckCircle size={18} color="#16A34A" style={{ marginRight: 8 }} />
                    <Text style={s.successText}>{success}</Text>
                  </View>
                )}

                {/* Form Section */}
                <Text style={s.sectionLabel}>Change Password</Text>

                {/* Current Password Field */}
                <View style={s.field}>
                  <Text style={s.fieldLabel}>Current Password</Text>
                  <View style={s.inputRow}>
                    <Lock size={18} color={colors.textMuted} style={s.inputIcon} />
                    <TextInput
                      style={s.input}
                      placeholder="Enter current password"
                      placeholderTextColor={colors.textMuted}
                      value={currentPassword}
                      secureTextEntry={!showCurrent}
                      onChangeText={(t) => {
                        setCurrentPassword(t);
                        if (error) setError(null);
                      }}
                      autoCapitalize="none"
                    />
                    <Pressable
                      onPress={() => setShowCurrent((p) => !p)}
                      style={s.eyeBtn}
                      hitSlop={8}
                    >
                      {showCurrent ? (
                        <EyeOff size={18} color={colors.textMuted} />
                      ) : (
                        <Eye size={18} color={colors.textMuted} />
                      )}
                    </Pressable>
                  </View>
                </View>

                {/* New Password Field */}
                <View style={s.field}>
                  <Text style={s.fieldLabel}>New Password</Text>
                  <View style={s.inputRow}>
                    <Lock size={18} color={colors.textMuted} style={s.inputIcon} />
                    <TextInput
                      style={s.input}
                      placeholder="Minimum 6 characters"
                      placeholderTextColor={colors.textMuted}
                      value={newPassword}
                      secureTextEntry={!showNew}
                      onChangeText={(t) => {
                        setNewPassword(t);
                        if (error) setError(null);
                      }}
                      autoCapitalize="none"
                    />
                    <Pressable
                      onPress={() => setShowNew((p) => !p)}
                      style={s.eyeBtn}
                      hitSlop={8}
                    >
                      {showNew ? (
                        <EyeOff size={18} color={colors.textMuted} />
                      ) : (
                        <Eye size={18} color={colors.textMuted} />
                      )}
                    </Pressable>
                  </View>
                </View>

                {/* Confirm New Password Field */}
                <View style={s.field}>
                  <Text style={s.fieldLabel}>Confirm New Password</Text>
                  <View style={s.inputRow}>
                    <Lock size={18} color={colors.textMuted} style={s.inputIcon} />
                    <TextInput
                      style={s.input}
                      placeholder="Re-enter new password"
                      placeholderTextColor={colors.textMuted}
                      value={confirmPassword}
                      secureTextEntry={!showConfirm}
                      onChangeText={(t) => {
                        setConfirmPassword(t);
                        if (error) setError(null);
                      }}
                      autoCapitalize="none"
                    />
                    <Pressable
                      onPress={() => setShowConfirm((p) => !p)}
                      style={s.eyeBtn}
                      hitSlop={8}
                    >
                      {showConfirm ? (
                        <EyeOff size={18} color={colors.textMuted} />
                      ) : (
                        <Eye size={18} color={colors.textMuted} />
                      )}
                    </Pressable>
                  </View>
                </View>

                {/* Password Helper Indicator */}
                <View style={s.hintsContainer}>
                  <View style={s.hintRow}>
                    <View
                      style={[
                        s.hintDot,
                        newPassword.length >= 6
                          ? { backgroundColor: '#16A34A' }
                          : { backgroundColor: colors.textMuted + '50' },
                      ]}
                    />
                    <Text
                      style={[
                        s.hintText,
                        newPassword.length >= 6 && { color: '#16A34A', fontWeight: '600' },
                      ]}
                    >
                      At least 6 characters
                    </Text>
                  </View>
                  <View style={s.hintRow}>
                    <View
                      style={[
                        s.hintDot,
                        newPassword.length > 0 && newPassword === confirmPassword
                          ? { backgroundColor: '#16A34A' }
                          : { backgroundColor: colors.textMuted + '50' },
                      ]}
                    />
                    <Text
                      style={[
                        s.hintText,
                        newPassword.length > 0 &&
                          newPassword === confirmPassword && { color: '#16A34A', fontWeight: '600' },
                      ]}
                    >
                      Passwords match
                    </Text>
                  </View>
                </View>

                {/* Submit Button */}
                <Pressable
                  onPress={handleSubmit}
                  disabled={loading}
                  style={[s.submitBtn, { backgroundColor: themeAccent }, loading && { opacity: 0.7 }]}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={s.submitBtnText}>Update Password</Text>
                  )}
                </Pressable>

                {/* Security Overview Card */}
                <View style={s.infoCard}>
                  <View style={s.infoCardHeader}>
                    <ShieldCheck size={18} color={themeAccent} style={{ marginRight: 8 }} />
                    <Text style={s.infoCardTitle}>Security Overview</Text>
                  </View>
                  <View style={s.infoItem}>
                    <Smartphone size={16} color={colors.textMuted} style={{ marginRight: 10 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.infoItemTitle}>Active Session</Text>
                      <Text style={s.infoItemSub}>
                        Institutional OAuth & Neon Encrypted Auth Session
                      </Text>
                    </View>
                    <View style={s.badge}>
                      <Text style={[s.badgeText, { color: '#16A34A' }]}>Secured</Text>
                    </View>
                  </View>
                  {/* Biometric / Fingerprint Control */}
                  <View style={[s.infoItem, { borderBottomWidth: 0, paddingBottom: 0 }]}>
                    <FingerprintIcon size={18} color={themeAccent} style={{ marginRight: 10 }} />
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={s.infoItemTitle}>
                        {biometricCaps?.biometricLabel || 'Fingerprint Verification'}
                      </Text>
                      <Text style={s.infoItemSub}>
                        {biometricCaps?.isAvailable
                          ? (biometricEnabled ? 'Enforced for attendance & login' : 'Tap switch to activate')
                          : 'No biometric credentials enrolled in OS'}
                      </Text>
                    </View>
                    <Switch
                      value={biometricEnabled}
                      onValueChange={handleToggleBiometrics}
                      trackColor={{ false: isDark ? '#374151' : '#D1D5DB', true: themeAccent }}
                      thumbColor="#FFFFFF"
                      disabled={bioTesting}
                    />
                  </View>

                  {/* Feedback & Sensor Test */}
                  {bioFeedback ? (
                    <View style={{ marginTop: 10, padding: 8, backgroundColor: isDark ? '#1F2937' : '#F3F4F6', borderRadius: 8 }}>
                      <Text style={{ fontSize: 12, color: bioFeedback.startsWith('✓') ? '#16A34A' : '#DC2626', fontWeight: '500' }}>
                        {bioFeedback}
                      </Text>
                    </View>
                  ) : null}

                  {biometricCaps?.isAvailable && (
                    <Pressable
                      onPress={handleTestSensor}
                      disabled={bioTesting}
                      style={{
                        marginTop: 10,
                        alignSelf: 'flex-start',
                        paddingVertical: 5,
                        paddingHorizontal: 12,
                        borderRadius: 8,
                        backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <FingerprintIcon size={13} color={themeAccent} />
                      <Text style={{ fontSize: 12, fontWeight: '600', color: themeAccent }}>
                        {bioTesting ? 'Scanning...' : 'Test Fingerprint Sensor'}
                      </Text>
                    </Pressable>
                  )}
                </View>
              </ScrollView>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function makeStyles(
  c: ReturnType<typeof import('../context/ThemeContext').useTheme>['colors'],
  themeAccent: string,
  isDark: boolean
) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    scrim: {
      flex: 1,
    },
    sheet: {
      backgroundColor: c.card,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      maxHeight: '88%',
      borderWidth: 1,
      borderColor: c.cardBorder,
      paddingTop: 16,
      paddingBottom: Platform.OS === 'ios' ? 36 : 24,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 10,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: c.cardBorder,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flex: 1,
    },
    iconBox: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: c.text,
      fontFamily: ff ? 'sans-serif-medium' : undefined,
    },
    headerSub: {
      fontSize: 12,
      color: c.textMuted,
      marginTop: 2,
      fontFamily: ff ? 'sans-serif' : undefined,
    },
    closeBtn: {
      padding: 8,
      borderRadius: 20,
      backgroundColor: c.cardAlt,
    },
    scroll: {
      flexGrow: 0,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 24,
    },
    errorBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#FEE2E2',
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 12,
      marginBottom: 16,
    },
    errorText: {
      flex: 1,
      fontSize: 13,
      color: '#B91C1C',
      fontWeight: '500',
      fontFamily: ff ? 'sans-serif' : undefined,
    },
    successBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#DCFCE7',
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 12,
      marginBottom: 16,
    },
    successText: {
      flex: 1,
      fontSize: 13,
      color: '#15803D',
      fontWeight: '600',
      fontFamily: ff ? 'sans-serif' : undefined,
    },
    sectionLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 14,
      fontFamily: ff ? 'sans-serif-medium' : undefined,
    },
    field: {
      marginBottom: 14,
    },
    fieldLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: c.text,
      marginBottom: 6,
      fontFamily: ff ? 'sans-serif-medium' : undefined,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: c.cardBorder,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: Platform.OS === 'ios' ? 13 : 10,
      backgroundColor: c.bg,
    },
    inputIcon: {
      marginRight: 10,
    },
    input: {
      flex: 1,
      fontSize: 15,
      color: c.text,
      fontFamily: ff ? 'sans-serif' : undefined,
    },
    eyeBtn: {
      padding: 6,
      marginLeft: 4,
    },
    hintsContainer: {
      flexDirection: 'row',
      gap: 16,
      marginTop: 2,
      marginBottom: 18,
      paddingHorizontal: 4,
    },
    hintRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    hintDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
    },
    hintText: {
      fontSize: 12,
      color: c.textMuted,
      fontFamily: ff ? 'sans-serif' : undefined,
    },
    submitBtn: {
      paddingVertical: 15,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 20,
      elevation: 2,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
    },
    submitBtnText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '700',
      fontFamily: ff ? 'sans-serif-medium' : undefined,
    },
    infoCard: {
      backgroundColor: c.cardAlt,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: c.cardBorder,
    },
    infoCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
    },
    infoCardTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: c.text,
      fontFamily: ff ? 'sans-serif-medium' : undefined,
    },
    infoItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: c.cardBorder,
    },
    infoItemTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: c.text,
      fontFamily: ff ? 'sans-serif-medium' : undefined,
    },
    infoItemSub: {
      fontSize: 11,
      color: c.textMuted,
      marginTop: 1,
      fontFamily: ff ? 'sans-serif' : undefined,
    },
    badge: {
      backgroundColor: isDark ? '#1F2937' : '#F3F4F6',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      marginLeft: 8,
    },
    badgeText: {
      fontSize: 11,
      fontWeight: '700',
      fontFamily: ff ? 'sans-serif-medium' : undefined,
    },
  });
}
