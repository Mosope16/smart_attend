import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, StyleSheet, Platform,
  KeyboardAvoidingView, TouchableWithoutFeedback, Keyboard,
} from 'react-native';
import { useRouter } from 'expo-router';
import { User, Lock, GraduationCap, Eye, EyeOff } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { formatFriendlyAuthError, isAllowedDomain, ALLOWED_EMAIL_DOMAIN, neonAuth } from '../../lib/auth';
import {
  getBiometricCapabilities,
  isBiometricEnabled,
  getSavedBiometricUser,
  authenticateWithBiometrics,
  SavedBiometricUser,
  saveBiometricUser,
} from '../../lib/biometrics';
import { FingerprintIcon } from '../../components/FingerprintIcon';

const ff = Platform.OS === 'android';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { signIn, isLoaded } = useAuth();
  const router = useRouter();
  const { colors, isDark } = useTheme();

  const [role, setRole] = useState<'student' | 'lecturer'>('student');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Biometric state
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioName, setBioName] = useState('Fingerprint');
  const [savedBioUser, setSavedBioUser] = useState<SavedBiometricUser | null>(null);

  const isStudent = role === 'student';
  const themeColor = isStudent ? colors.primary : colors.secondary;

  useEffect(() => {
    (async () => {
      try {
        const caps = await getBiometricCapabilities();
        const enabled = await isBiometricEnabled();
        const saved = await getSavedBiometricUser();
        if (caps.isAvailable && enabled && saved) {
          setBioAvailable(true);
          setBioName(caps.biometricLabel);
          setSavedBioUser(saved);
          if (saved.role) {
            setRole(saved.role);
          }
        }
      } catch {}
    })();
  }, []);

  const onSignInPress = async () => {
    if (!isLoaded || !identifier.trim() || !password) {
      setError('Please enter your credentials');
      return;
    }
    const trimmedId = identifier.trim().toLowerCase();
    if (trimmedId.includes('@') && !isAllowedDomain(trimmedId)) {
      setError(`Access restricted: Only official Redeemer's University email addresses (@${ALLOWED_EMAIL_DOMAIN}) are permitted to sign in.`);
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await signIn({ identifier: identifier.trim(), password });
      if (res.user) {
        // Save user session for fast biometric login
        await saveBiometricUser({
          id: res.user.id,
          email: res.user.email,
          name: res.user.name,
          role: res.user.role,
          matric_number: res.user.matric_number,
          staff_id: res.user.staff_id,
        }).catch(() => {});
        router.replace('/');
      } else {
        setError(formatFriendlyAuthError(res.error || 'Invalid credentials. Please try again.'));
      }
    } catch (err: any) {
      setError(formatFriendlyAuthError(err?.message || 'An error occurred during sign in.'));
    } finally {
      setLoading(false);
    }
  };

  const onBiometricSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      const result = await authenticateWithBiometrics({
        promptMessage: `Verify your ${bioName.toLowerCase()} to log in`,
      });
      if (!result.success) {
        if (!result.cancelled) {
          setError(result.error || 'Biometric authentication failed.');
        }
        setLoading(false);
        return;
      }

      // Check if session is cached in local SecureStore
      const session = await neonAuth.getStoredSession();
      if (session?.user) {
        router.replace('/');
        return;
      }

      // If token expired, pre-fill identifier to prompt password
      if (savedBioUser) {
        const idToFill = savedBioUser.email || savedBioUser.matric_number || savedBioUser.staff_id || '';
        setIdentifier(idToFill);
        setError('Session expired. Please enter your password to re-authenticate.');
      }
    } catch (err: any) {
      setError(err?.message || 'Biometric login error.');
    } finally {
      setLoading(false);
    }
  };

  const s = makeStyles(colors);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <ScrollView
          style={s.container}
          contentContainerStyle={[
            s.content,
            {
              flexGrow: 1,
              paddingTop: Math.max(insets.top, 20) + 16,
              paddingBottom: Math.max(insets.bottom, 24) + 24,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
      {/* Logo */}
      <View style={s.logoContainer}>
        <View style={[s.logoRing, { borderColor: themeColor }]}>
          <GraduationCap size={40} color={themeColor} />
        </View>
        <Text style={s.appName}>SmartAttend</Text>
        <Text style={s.appTagline}>Attendance made simple</Text>
      </View>

      {/* Role Switcher */}
      <View style={s.roleSwitcher}>
        <Pressable onPress={() => setRole('student')} style={[s.roleBtn, isStudent && { backgroundColor: themeColor }]}>
          <Text style={[s.roleBtnText, isStudent && s.roleBtnTextActive]}>Student</Text>
        </Pressable>
        <Pressable onPress={() => setRole('lecturer')} style={[s.roleBtn, !isStudent && { backgroundColor: themeColor }]}>
          <Text style={[s.roleBtnText, !isStudent && s.roleBtnTextActive]}>Lecturer</Text>
        </Pressable>
      </View>

      {/* Error */}
      {error ? (
        <View style={s.errorBox}>
          <Text style={s.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* Fields */}
      <View style={s.fieldGroup}>
        <View style={s.inputRow}>
          <User size={20} color={colors.textMuted} style={{ marginRight: 10 }} />
          <TextInput
            style={s.input}
            autoCapitalize="none"
            value={identifier}
            placeholder={isStudent ? 'RUN Email (@run.edu.ng) or Matric No.' : 'RUN Email (@run.edu.ng) or Staff ID'}
            placeholderTextColor={colors.textMuted}
            keyboardType="email-address"
            onChangeText={setIdentifier}
          />
        </View>
        <View style={s.inputRow}>
          <Lock size={20} color={colors.textMuted} style={{ marginRight: 10 }} />
          <TextInput
            style={s.input}
            value={password}
            placeholder="Password"
            placeholderTextColor={colors.textMuted}
            secureTextEntry={!showPassword}
            onChangeText={setPassword}
          />
          <Pressable onPress={() => setShowPassword(p => !p)} style={s.eyeBtn}>
            {showPassword
              ? <EyeOff size={18} color={colors.textMuted} />
              : <Eye size={18} color={colors.textMuted} />
            }
          </Pressable>
        </View>
      </View>

      {/* Forgot */}
      <View style={s.rememberRow}>
        <View />
        <Pressable>
          <Text style={[s.forgotText, { color: themeColor }]}>Forgot Password?</Text>
        </Pressable>
      </View>

      {/* Login Button */}
      <Pressable onPress={onSignInPress} disabled={loading} style={[s.primaryBtn, { backgroundColor: loading ? colors.primaryDim : themeColor }]}>
        <Text style={s.primaryBtnText}>{loading ? 'Signing in...' : 'Login'}</Text>
      </Pressable>

      {/* Biometric Quick Login */}
      {bioAvailable && savedBioUser ? (
        <Pressable
          onPress={onBiometricSignIn}
          disabled={loading}
          style={[
            s.biometricBtn,
            {
              borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)',
              backgroundColor: isDark ? colors.cardAlt : colors.card,
            },
          ]}
        >
          <FingerprintIcon size={20} color={themeColor} style={{ marginRight: 8 }} />
          <Text style={[s.biometricBtnText, { color: colors.text }]}>
            Sign In with {bioName}
          </Text>
        </Pressable>
      ) : null}

      {/* Sign Up Link */}
      <View style={s.footerRow}>
        <Text style={s.footerText}>Don't have an account? </Text>
        <Pressable onPress={() => router.push({ pathname: '/(auth)/register', params: { defaultRole: role } })}>
          <Text style={[s.footerLink, { color: themeColor }]}>Sign Up</Text>
        </Pressable>
      </View>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

function makeStyles(c: ReturnType<typeof import('../../context/ThemeContext').useTheme>['colors']) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    content: { paddingHorizontal: 24, paddingBottom: 40 },
    logoContainer: { alignItems: 'center', marginBottom: 32 },
    logoRing: { width: 80, height: 80, borderRadius: 40, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    appName: { fontSize: 28, fontWeight: '700', color: c.text, fontFamily: ff ? 'sans-serif-medium' : undefined },
    appTagline: { fontSize: 14, color: c.textSub, marginTop: 4, fontFamily: ff ? 'sans-serif' : undefined },
    roleSwitcher: { flexDirection: 'row', backgroundColor: c.cardAlt, borderRadius: 999, padding: 4, marginBottom: 28 },
    roleBtn: { flex: 1, paddingVertical: 12, borderRadius: 999, alignItems: 'center' },
    roleBtnText: { fontSize: 14, fontWeight: '600', color: c.textSub, fontFamily: ff ? 'sans-serif-medium' : undefined },
    roleBtnTextActive: { color: '#FFFFFF' },
    errorBox: { backgroundColor: '#FEF2F2', padding: 12, borderRadius: 12, marginBottom: 16 },
    errorText: { color: '#DC2626', textAlign: 'center', fontSize: 14, fontFamily: ff ? 'sans-serif' : undefined },
    fieldGroup: { gap: 12, marginBottom: 16 },
    inputRow: {
      flexDirection: 'row', alignItems: 'center',
      borderWidth: 1, borderColor: c.cardBorder, borderRadius: 16,
      paddingHorizontal: 16, paddingVertical: 14, backgroundColor: c.card,
    },
    input: { flex: 1, fontSize: 16, color: c.text, fontFamily: ff ? 'sans-serif' : undefined },
    eyeBtn: { padding: 4, marginLeft: 6 },
    rememberRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 28 },
    forgotText: { fontSize: 14, fontWeight: '600', fontFamily: ff ? 'sans-serif-medium' : undefined },
    primaryBtn: { paddingVertical: 16, borderRadius: 16, alignItems: 'center', marginBottom: 20, elevation: 2 },
    primaryBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 17, fontFamily: ff ? 'sans-serif-medium' : undefined },
    biometricBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
      borderRadius: 16,
      borderWidth: 1,
      marginBottom: 24,
      marginTop: -4,
    },
    biometricBtnText: {
      fontSize: 15,
      fontWeight: '600',
      fontFamily: ff ? 'sans-serif-medium' : undefined,
    },
    footerRow: { flexDirection: 'row', justifyContent: 'center', paddingBottom: 24 },
    footerText: { fontSize: 14, color: c.textSub, fontFamily: ff ? 'sans-serif' : undefined },
    footerLink: { fontSize: 14, fontWeight: '700', fontFamily: ff ? 'sans-serif-medium' : undefined },
  });
}
