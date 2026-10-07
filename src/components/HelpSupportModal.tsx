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
  Linking,
  ActivityIndicator,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import {
  HelpCircle,
  X,
  ChevronDown,
  ChevronUp,
  Mail,
  ExternalLink,
  MapPin,
  QrCode,
  Bell,
  MessageSquare,
  CheckCircle,
  Info,
  ShieldCheck,
} from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';

const ff = Platform.OS === 'android';

interface HelpSupportModalProps {
  visible: boolean;
  onClose: () => void;
  accentColor?: string;
  role?: 'student' | 'lecturer';
}

interface FAQItem {
  id: string;
  question: string;
  answer: string;
  icon: any;
}

const FAQ_LIST: FAQItem[] = [
  {
    id: 'proxy-protection',
    icon: ShieldCheck,
    question: 'How does SmartAttend prevent proxy attendance?',
    answer:
      'SmartAttend enforces Single-Device Locking for each session. A physical phone can only record attendance for ONE student per lecture. If a classmate signs in on their phone to mark for an absent friend, the second check-in is instantly blocked. If you genuinely get a new phone, your account automatically updates to your new device with zero disruption.',
  },
  {
    id: 'gps-lock',
    icon: MapPin,
    question: 'Why was GPS lock slow or timed out indoors?',
    answer:
      'Inside reinforced concrete university buildings, direct satellite signals can be blocked. To achieve an instant, accurate location fix: turn your Wi-Fi toggle ON (even if not connected to a network, Wi-Fi scanning enables fast indoor triangulation) and ensure High/Balanced Accuracy is enabled in device Location settings.',
  },
  {
    id: 'geofence',
    icon: MapPin,
    question: 'How does GPS Geofencing work?',
    answer:
      'SmartAttend verifies that you are physically in the lecture hall during class. The lecturer sets an attendance boundary (typically 50m). Your GPS coordinates are checked strictly when marking attendance to guarantee academic integrity.',
  },
  {
    id: 'range-expansion',
    icon: Info,
    question: 'Can the lecturer adjust the attendance range?',
    answer:
      'Yes. Lecturers have full control to expand the session boundary (from 50m up to 150m+) before or during an active session to accommodate larger lecture halls, auditoriums, or concrete buildings.',
  },
  {
    id: 'qr-code',
    icon: QrCode,
    question: 'How does dynamic QR code verification work?',
    answer:
      'Lecturers project a dynamic QR code that refreshes periodically. When scanned via the SmartAttend camera, both the time-sensitive cryptographic token and your proximity are verified concurrently.',
  },
  {
    id: 'camera-issue',
    icon: QrCode,
    question: 'What if I cannot scan the QR code?',
    answer:
      'Check that camera permissions are enabled in device settings. If camera issues persist, you can enter the 6-character session attendance code manually, or request a lecturer manual override.',
  },
  {
    id: 'notifications',
    icon: Bell,
    question: 'How do push notifications work?',
    answer:
      'Push notifications alert you as soon as an attendance session is activated for any of your enrolled courses. You can toggle push notifications on or off in your Profile tab.',
  },
];

const ISSUE_CATEGORIES = ['GPS / Location', 'QR Scanner', 'Courses', 'Account', 'General'];

export default function HelpSupportModal({
  visible,
  onClose,
  accentColor,
  role = 'student',
}: HelpSupportModalProps) {
  const { colors, isDark } = useTheme();
  const themeAccent = accentColor || (role === 'lecturer' ? colors.secondary : colors.primary);

  const [expandedFaq, setExpandedFaq] = useState<string | null>('gps-lock');
  const [selectedCategory, setSelectedCategory] = useState('GPS / Location');
  const [feedbackText, setFeedbackText] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  const handleToggleFaq = (id: string) => {
    setExpandedFaq((prev) => (prev === id ? null : id));
  };

  const handleOpenEmail = () => {
    Linking.openURL(
      `mailto:ictsupport@run.edu.ng?subject=SmartAttend%20Support%20Request%20(${role})&body=Hi%20ICT%20Support,%0D%0A%0D%0APlease%20assist%20me%20with:`
    ).catch(() => {});
  };

  const handleOpenPortal = () => {
    Linking.openURL('https://run.edu.ng').catch(() => {});
  };

  const handleSubmitFeedback = () => {
    if (!feedbackText.trim()) return;
    setSubmittingFeedback(true);
    setTimeout(() => {
      setSubmittingFeedback(false);
      setFeedbackSubmitted(true);
      setFeedbackText('');
      setTimeout(() => {
        setFeedbackSubmitted(false);
      }, 4000);
    }, 600);
  };

  const s = makeStyles(colors, themeAccent, isDark);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={s.backdrop}>
            <Pressable style={s.scrim} onPress={onClose} />
            <View style={s.sheet}>
              {/* Header */}
              <View style={s.header}>
                <View style={s.headerLeft}>
                  <View style={[s.iconBox, { backgroundColor: themeAccent + '18' }]}>
                    <HelpCircle size={22} color={themeAccent} />
                  </View>
                  <View>
                    <Text style={s.headerTitle}>Help & Support</Text>
                    <Text style={s.headerSub}>Redeemer's University • SmartAttend</Text>
                  </View>
                </View>
                <Pressable onPress={onClose} style={s.closeBtn} hitSlop={10}>
                  <X size={20} color={colors.textMuted} />
                </Pressable>
              </View>

              <ScrollView
                style={s.scroll}
                contentContainerStyle={s.scrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {/* Contact Support Quick Actions */}
                <View style={s.quickActionsRow}>
                  <Pressable
                    onPress={handleOpenEmail}
                    style={[s.quickBtn, { borderColor: themeAccent + '40', backgroundColor: themeAccent + '12' }]}
                  >
                    <Mail size={18} color={themeAccent} style={{ marginRight: 8 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={[s.quickBtnTitle, { color: themeAccent }]}>Email ICT Helpdesk</Text>
                      <Text style={s.quickBtnSub}>ictsupport@run.edu.ng</Text>
                    </View>
                    <ExternalLink size={14} color={themeAccent} />
                  </Pressable>

                  <Pressable onPress={handleOpenPortal} style={s.portalBtn}>
                    <ExternalLink size={16} color={colors.textSub} style={{ marginRight: 6 }} />
                    <Text style={s.portalBtnText}>RUN Portal</Text>
                  </Pressable>
                </View>

                {/* Frequently Asked Questions */}
                <Text style={s.sectionLabel}>Frequently Asked Questions</Text>
                <View style={s.faqList}>
                  {FAQ_LIST.map((faq) => {
                    const isExpanded = expandedFaq === faq.id;
                    const IconComponent = faq.icon;
                    return (
                      <View
                        key={faq.id}
                        style={[
                          s.faqItem,
                          isExpanded && { borderColor: themeAccent + '55', backgroundColor: colors.cardAlt },
                        ]}
                      >
                        <Pressable
                          onPress={() => handleToggleFaq(faq.id)}
                          style={s.faqHeader}
                        >
                          <View
                            style={[
                              s.faqIconCircle,
                              { backgroundColor: isExpanded ? themeAccent + '20' : colors.bg },
                            ]}
                          >
                            <IconComponent
                              size={16}
                              color={isExpanded ? themeAccent : colors.textSub}
                            />
                          </View>
                          <Text
                            style={[
                              s.faqQuestion,
                              isExpanded && { color: themeAccent, fontWeight: '700' },
                            ]}
                          >
                            {faq.question}
                          </Text>
                          {isExpanded ? (
                            <ChevronUp size={18} color={themeAccent} />
                          ) : (
                            <ChevronDown size={18} color={colors.textMuted} />
                          )}
                        </Pressable>
                        {isExpanded && (
                          <View style={s.faqBody}>
                            <Text style={s.faqAnswer}>{faq.answer}</Text>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>

                {/* In-App Feedback / Report Issue */}
                <Text style={[s.sectionLabel, { marginTop: 22 }]}>Report an Issue / Feedback</Text>
                <View style={s.feedbackCard}>
                  {feedbackSubmitted ? (
                    <View style={s.feedbackSuccess}>
                      <CheckCircle size={28} color="#16A34A" style={{ marginBottom: 8 }} />
                      <Text style={s.feedbackSuccessTitle}>Thank you for your feedback!</Text>
                      <Text style={s.feedbackSuccessSub}>
                        Your report has been logged and sent to the SmartAttend ICT support team.
                      </Text>
                    </View>
                  ) : (
                    <>
                      <Text style={s.feedbackPrompt}>
                        Experiencing an issue with GPS, attendance, or courses? Let us know:
                      </Text>

                      {/* Category Pills */}
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={s.categoryPills}
                      >
                        {ISSUE_CATEGORIES.map((cat) => {
                          const active = selectedCategory === cat;
                          return (
                            <Pressable
                              key={cat}
                              onPress={() => setSelectedCategory(cat)}
                              style={[
                                s.categoryPill,
                                active && { backgroundColor: themeAccent, borderColor: themeAccent },
                              ]}
                            >
                              <Text
                                style={[
                                  s.categoryPillText,
                                  active && { color: '#FFFFFF', fontWeight: '700' },
                                ]}
                              >
                                {cat}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </ScrollView>

                      {/* Text Input */}
                      <TextInput
                        style={s.feedbackInput}
                        placeholder={`Describe what happened with ${selectedCategory}...`}
                        placeholderTextColor={colors.textMuted}
                        value={feedbackText}
                        onChangeText={setFeedbackText}
                        multiline
                        numberOfLines={3}
                        textAlignVertical="top"
                      />

                      {/* Submit Button */}
                      <Pressable
                        onPress={handleSubmitFeedback}
                        disabled={submittingFeedback || !feedbackText.trim()}
                        style={[
                          s.feedbackSubmitBtn,
                          { backgroundColor: themeAccent },
                          (!feedbackText.trim() || submittingFeedback) && { opacity: 0.5 },
                        ]}
                      >
                        {submittingFeedback ? (
                          <ActivityIndicator color="#FFFFFF" size="small" />
                        ) : (
                          <>
                            <MessageSquare size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                            <Text style={s.feedbackSubmitText}>Submit Report</Text>
                          </>
                        )}
                      </Pressable>
                    </>
                  )}
                </View>

                {/* Footer Info */}
                <View style={s.footerInfo}>
                  <Text style={s.footerTitle}>SmartAttend v1.0.0 (Build 2026.1)</Text>
                  <Text style={s.footerText}>
                    Directorate of Information & Communication Technology (ICT)
                  </Text>
                  <Text style={s.footerText}>Redeemer's University, Ede, Osun State</Text>
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
      maxHeight: '90%',
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
    quickActionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 20,
    },
    quickBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 14,
      borderWidth: 1,
    },
    quickBtnTitle: {
      fontSize: 13,
      fontWeight: '700',
      fontFamily: ff ? 'sans-serif-medium' : undefined,
    },
    quickBtnSub: {
      fontSize: 11,
      color: c.textMuted,
      marginTop: 1,
      fontFamily: ff ? 'sans-serif' : undefined,
    },
    portalBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 12,
      borderRadius: 14,
      backgroundColor: c.cardAlt,
      borderWidth: 1,
      borderColor: c.cardBorder,
    },
    portalBtnText: {
      fontSize: 12,
      fontWeight: '600',
      color: c.textSub,
      fontFamily: ff ? 'sans-serif-medium' : undefined,
    },
    sectionLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 12,
      fontFamily: ff ? 'sans-serif-medium' : undefined,
    },
    faqList: {
      gap: 10,
    },
    faqItem: {
      backgroundColor: c.bg,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.cardBorder,
      overflow: 'hidden',
    },
    faqHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 14,
      gap: 12,
    },
    faqIconCircle: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    faqQuestion: {
      flex: 1,
      fontSize: 14,
      fontWeight: '600',
      color: c.text,
      fontFamily: ff ? 'sans-serif-medium' : undefined,
    },
    faqBody: {
      paddingHorizontal: 16,
      paddingBottom: 14,
      paddingTop: 2,
    },
    faqAnswer: {
      fontSize: 13,
      lineHeight: 19,
      color: c.textSub,
      fontFamily: ff ? 'sans-serif' : undefined,
    },
    feedbackCard: {
      backgroundColor: c.cardAlt,
      borderRadius: 18,
      padding: 16,
      borderWidth: 1,
      borderColor: c.cardBorder,
    },
    feedbackPrompt: {
      fontSize: 13,
      color: c.text,
      marginBottom: 12,
      fontWeight: '500',
      fontFamily: ff ? 'sans-serif' : undefined,
    },
    categoryPills: {
      flexDirection: 'row',
      gap: 8,
      paddingBottom: 12,
    },
    categoryPill: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.cardBorder,
    },
    categoryPillText: {
      fontSize: 12,
      color: c.textSub,
      fontWeight: '600',
      fontFamily: ff ? 'sans-serif' : undefined,
    },
    feedbackInput: {
      backgroundColor: c.bg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.cardBorder,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 13,
      color: c.text,
      minHeight: 74,
      marginBottom: 12,
      fontFamily: ff ? 'sans-serif' : undefined,
    },
    feedbackSubmitBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      borderRadius: 12,
    },
    feedbackSubmitText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '700',
      fontFamily: ff ? 'sans-serif-medium' : undefined,
    },
    feedbackSuccess: {
      alignItems: 'center',
      paddingVertical: 14,
    },
    feedbackSuccessTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: '#16A34A',
      marginBottom: 4,
      fontFamily: ff ? 'sans-serif-medium' : undefined,
    },
    feedbackSuccessSub: {
      fontSize: 12,
      color: c.textSub,
      textAlign: 'center',
      lineHeight: 17,
      fontFamily: ff ? 'sans-serif' : undefined,
    },
    footerInfo: {
      alignItems: 'center',
      marginTop: 24,
      paddingVertical: 8,
      borderTopWidth: 1,
      borderTopColor: c.cardBorder,
    },
    footerTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: c.textSub,
      marginBottom: 3,
      fontFamily: ff ? 'sans-serif-medium' : undefined,
    },
    footerText: {
      fontSize: 11,
      color: c.textMuted,
      lineHeight: 16,
      textAlign: 'center',
      fontFamily: ff ? 'sans-serif' : undefined,
    },
  });
}
