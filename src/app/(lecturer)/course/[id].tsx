import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, Platform, ActivityIndicator, Alert, Modal, TextInput, FlatList,
} from 'react-native';
import { StatusBar } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useUser } from '../../../context/AuthContext';
import { useSupabaseClient } from '../../../lib/supabase';
import {
  ChevronLeft, Users, QrCode, User, Clock, RefreshCw, Download, MapPin, XCircle, Smartphone,
  Shield, UserPlus, Trash2, Search, X, Check,
} from 'lucide-react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import { exportCsv } from '../../../lib/exportCsv';
import QRCode from 'react-native-qrcode-svg';
import Svg, { Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../context/ThemeContext';
import { formatDate, formatTime, formatDDMMYYYY } from '../../../lib/dateUtils';
import { getCurrentAttendanceLocation } from '../../../lib/geo';
import {
  fetchCourseInstructors,
  addCoLecturer,
  removeCoLecturer,
  searchAvailableLecturers,
  CourseInstructor,
} from '../../../lib/courseService';
import { DatabaseCourse, StudentRosterItem } from '../../../types/database';

const ff = Platform.OS === 'android';

const RADIUS_OPTIONS = [
  { value: 30, label: '30m', desc: 'Small Lab' },
  { value: 50, label: '50m', desc: 'Classroom' },
  { value: 100, label: '100m', desc: 'Large Hall' },
  { value: 200, label: '200m', desc: 'Auditorium' },
];

export default function LecturerCourseDetails() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const supabase = useSupabaseClient();
  const { colors, isDark } = useTheme();

  const [course, setCourse] = useState<DatabaseCourse | null>(null);
  const [activeSession, setActiveSession] = useState<any>(null);
  const [selectedRadius, setSelectedRadius] = useState<number>(50);
  const [students, setStudents] = useState<StudentRosterItem[]>([]);
  const [presentStudentIds, setPresentStudentIds] = useState<Set<string>>(new Set());
  const [presentStudentDevices, setPresentStudentDevices] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Co-Lecturer Management State
  const [instructors, setInstructors] = useState<{ lead: CourseInstructor | null; coLecturers: CourseInstructor[] }>({
    lead: null,
    coLecturers: [],
  });
  const [showAddLecturerModal, setShowAddLecturerModal] = useState(false);
  const [searchLecturerText, setSearchLecturerText] = useState('');
  const [availableLecturers, setAvailableLecturers] = useState<any[]>([]);
  const [searchingLecturers, setSearchingLecturers] = useState(false);
  const [addingLecturerId, setAddingLecturerId] = useState<string | null>(null);

  const isLeadLecturer = Boolean(
    user && course && (course.lecturer_id === user.id || instructors.lead?.lecturer_id === user.id)
  );

  useEffect(() => {
    StatusBar.setBarStyle(isDark ? 'light-content' : 'dark-content');
    if (Platform.OS === 'android') StatusBar.setBackgroundColor(isDark ? '#071A40' : colors.secondary);
  }, [isDark, colors.secondary]);

  const loadData = async () => {
    try {
      // Fetch course, students, and instructors
      const [courseRes, studentsRes, instructorsRes] = await Promise.all([
        supabase.from('courses').select('*').eq('id', id).single(),
        supabase.from('enrollments').select('id, student:student_id ( id, name, matric_number )').eq('course_id', id),
        fetchCourseInstructors(id as string),
      ]);

      if (courseRes.data) setCourse(courseRes.data);
      if (studentsRes.data) setStudents(studentsRes.data);
      if (instructorsRes) setInstructors(instructorsRes);

      // Fetch active session
      const now = new Date().toISOString();
      const { data: sessionData } = await supabase
        .from('attendance_sessions')
        .select('*')
        .eq('course_id', id)
        .gt('end_time', now)
        .order('end_time', { ascending: false })
        .limit(1)
        .single();
      
      setActiveSession(sessionData ?? null);
      if (sessionData?.radius_meters) {
        setSelectedRadius(sessionData.radius_meters);
      }

      // If active session, fetch attendance records
      if (sessionData) {
        const { data: recordsData } = await supabase
          .from('attendance_records')
          .select('student_id, device_name')
          .eq('session_id', sessionData.id)
          .eq('status', 'present');
        
        const presentIds = new Set<string>((recordsData ?? []).map((r: any) => r.student_id as string));
        const devMap: Record<string, string> = {};
        (recordsData ?? []).forEach((r: any) => {
          if (r.student_id && r.device_name) {
            devMap[r.student_id] = r.device_name;
          }
        });
        setPresentStudentIds(presentIds);
        setPresentStudentDevices(devMap);
      } else {
        setPresentStudentIds(new Set<string>());
        setPresentStudentDevices({});
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadData();
    }, [id])
  );

  const handleOpenAddModal = async () => {
    setShowAddLecturerModal(true);
    setSearchLecturerText('');
    setSearchingLecturers(true);
    const exclude = [
      ...(instructors.lead ? [instructors.lead.lecturer_id] : []),
      ...instructors.coLecturers.map((cl) => cl.lecturer_id),
    ];
    const results = await searchAvailableLecturers('', course?.department, exclude);
    setAvailableLecturers(results);
    setSearchingLecturers(false);
  };

  const handleSearchLecturers = async (text: string) => {
    setSearchLecturerText(text);
    setSearchingLecturers(true);
    const exclude = [
      ...(instructors.lead ? [instructors.lead.lecturer_id] : []),
      ...instructors.coLecturers.map((cl) => cl.lecturer_id),
    ];
    const results = await searchAvailableLecturers(text, course?.department, exclude);
    setAvailableLecturers(results);
    setSearchingLecturers(false);
  };

  const handleAddCoLecturer = async (lecturerId: string) => {
    try {
      setAddingLecturerId(lecturerId);
      const res = await addCoLecturer(id as string, lecturerId);
      if (!res.success) {
        Alert.alert('Unable to Add Co-Lecturer', res.error || 'Failed to add co-lecturer.');
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowAddLecturerModal(false);
      const updated = await fetchCourseInstructors(id as string);
      setInstructors(updated);
      Alert.alert('Co-Lecturer Assigned', 'Your colleague can now launch sessions and manage this course.');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to add co-lecturer.');
    } finally {
      setAddingLecturerId(null);
    }
  };

  const handleRemoveCoLecturer = (lecturerId: string, name: string) => {
    Alert.alert(
      'Remove Co-Lecturer?',
      `Are you sure you want to remove ${name} from this course?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const res = await removeCoLecturer(id as string, lecturerId);
            if (!res.success) {
              Alert.alert('Error', res.error || 'Failed to remove co-lecturer.');
              return;
            }
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            const updated = await fetchCourseInstructors(id as string);
            setInstructors(updated);
          },
        },
      ]
    );
  };

  // Real-time subscription to automatically update the roster when a student marks present
  useEffect(() => {
    if (!activeSession?.id) return;

    const channel = supabase
      .channel(`realtime_attendance_${activeSession.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'attendance_records', filter: `session_id=eq.${activeSession.id}` },
        (payload) => {
          setPresentStudentIds((prev) => {
            const newSet = new Set(prev);
            newSet.add(payload.new.student_id);
            return newSet;
          });
          if (payload.new.student_id && payload.new.device_name) {
            setPresentStudentDevices((prev) => ({
              ...prev,
              [payload.new.student_id]: payload.new.device_name,
            }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeSession?.id, supabase]);

  // Real-time subscription to update the enrolled list if a new student enrolls
  useEffect(() => {
    const channel = supabase
      .channel(`realtime_enrollments_${id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'enrollments', filter: `course_id=eq.${id}` },
        () => {
          // Re-fetch just the students list so the roster updates
          supabase
            .from('enrollments')
            .select('id, student:student_id ( id, name, matric_number )')
            .eq('course_id', id)
            .then(({ data }) => {
              if (data) setStudents(data);
            });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, supabase]);

  const [timeLeft, setTimeLeft] = useState<string>('');

  // Live countdown timer that automatically expires the session when time elapses
  useEffect(() => {
    if (!activeSession?.end_time) {
      setTimeLeft('');
      return;
    }

    const checkTime = () => {
      const diff = new Date(activeSession.end_time).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft('00:00');
        setActiveSession(null);
      } else {
        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        setTimeLeft(`${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`);
      }
    };

    checkTime();
    const interval = setInterval(checkTime, 1000);
    return () => clearInterval(interval);
  }, [activeSession?.end_time]);

  const endSession = async () => {
    if (!activeSession) return;

    Alert.alert(
      'Close Attendance Session?',
      'Are you sure you want to end this attendance session now? Students will no longer be able to mark attendance.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Session',
          style: 'destructive',
          onPress: async () => {
            const now = new Date().toISOString();
            await supabase
              .from('attendance_sessions')
              .update({ end_time: now })
              .eq('id', activeSession.id);
            setActiveSession(null);
          },
        },
      ]
    );
  };

  const startSession = async () => {
    let latitude: number | null = null;
    let longitude: number | null = null;

    const locResult = await getCurrentAttendanceLocation();
    if (locResult.error || !locResult.coords) {
      Alert.alert(
        'GPS Location Required',
        locResult.error || 'Location access is required so students within the lecture hall geofence can mark attendance.'
      );
      return;
    }

    latitude = locResult.coords.latitude;
    longitude = locResult.coords.longitude;

    const code = Math.random().toString(36).substring(2, 7).toUpperCase();
    const endTime = new Date(Date.now() + 10 * 60000).toISOString();
    const { data, error } = await supabase
      .from('attendance_sessions')
      .insert({
        course_id: id,
        lecturer_id: user?.id,
        attendance_code: code,
        end_time: endTime,
        latitude,
        longitude,
        radius_meters: selectedRadius,
      })
      .select()
      .single();
    if (data && !error) {
      setActiveSession(data);
      setPresentStudentIds(new Set());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Alert.alert('Error', 'Failed to start session.');
    }
  };

  const handleUpdateLiveRadius = async (newRadius: number) => {
    if (!activeSession) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setSelectedRadius(newRadius);
      setActiveSession((prev: any) => ({ ...prev, radius_meters: newRadius }));

      const { error } = await supabase
        .from('attendance_sessions')
        .update({ radius_meters: newRadius })
        .eq('id', activeSession.id);

      if (error) {
        console.error('Failed to update live radius:', error);
      }
    } catch (e) {
      console.error('Error updating live radius:', e);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const [exporting, setExporting] = useState(false);

  const handleExportCSV = async () => {
    if (!course) return;
    if (students.length === 0) {
      Alert.alert('No Student Data', 'No students are enrolled in this course yet.');
      return;
    }

    try {
      setExporting(true);

      // 1. Fetch all attendance sessions for this course, ordered chronologically starting with the first lecture
      const { data: allSessions, error: sessErr } = await supabase
        .from('attendance_sessions')
        .select('id, start_time, end_time, created_at, lecturer:lecturer_id ( id, name )')
        .eq('course_id', id)
        .order('start_time', { ascending: true });

      if (sessErr) {
        console.warn('Error fetching all course sessions:', sessErr);
      }

      const sessions = allSessions ?? [];
      const sessionIds = sessions.map((s: any) => s.id);

      // 2. Fetch all attendance records for these sessions
      const presenceSet = new Set<string>();
      if (sessionIds.length > 0) {
        const { data: recordsData, error: recErr } = await supabase
          .from('attendance_records')
          .select('student_id, session_id, status')
          .in('session_id', sessionIds)
          .eq('status', 'present');

        if (recErr) {
          console.warn('Error fetching attendance records:', recErr);
        }

        (recordsData ?? []).forEach((r: any) => {
          if (r.student_id && r.session_id) {
            presenceSet.add(`${r.student_id}_${r.session_id}`);
          }
        });
      }

      // 3. Format date headers (dd/mm/yyyy), disambiguating any multiple sessions and attributing instructor
      const dateCountMap = new Map<string, number>();
      sessions.forEach((s: any) => {
        const d = formatDDMMYYYY(s.start_time || s.created_at);
        dateCountMap.set(d, (dateCountMap.get(d) || 0) + 1);
      });

      const dateSeenMap = new Map<string, number>();
      const sessionDateHeaders = sessions.map((s: any) => {
        const d = formatDDMMYYYY(s.start_time || s.created_at);
        const lecturerName = s.lecturer?.name ? ` (${s.lecturer.name})` : '';
        const count = dateCountMap.get(d) || 0;
        if (count > 1) {
          const seen = (dateSeenMap.get(d) || 0) + 1;
          dateSeenMap.set(d, seen);
          return `${d} #${seen}${lecturerName}`;
        }
        return `${d}${lecturerName}`;
      });

      // 4. Construct CSV Headers: S/N, Matric No., Full Name, Dates (dd/mm/yyyy), Total Present, Total Sessions, Attendance Rate (%)
      const headers: (string | number)[] = [
        'S/N',
        'Matric No.',
        'Full Name',
        ...(sessionDateHeaders.length > 0 ? sessionDateHeaders : ['No Lectures Held']),
        'Total Present',
        'Total Sessions',
        'Attendance Rate (%)',
      ];

      // 5. Sort enrolled students consistently by Matric No., then Full Name
      const sortedStudents = [...students].sort((a: any, b: any) => {
        const matA = (a.student?.matric_number || '').trim().toLowerCase();
        const matB = (b.student?.matric_number || '').trim().toLowerCase();
        if (matA && matB) return matA.localeCompare(matB, undefined, { numeric: true });
        const nameA = (a.student?.name || '').trim().toLowerCase();
        const nameB = (b.student?.name || '').trim().toLowerCase();
        return nameA.localeCompare(nameB);
      });

      // 6. Build Student Rows with 'Present' or 'Absent' under each date
      const rows: (string | number)[][] = [headers];

      sortedStudents.forEach((item: any, index: number) => {
        const student = item.student;
        if (!student) return;

        let presentCount = 0;
        const dateStatuses = sessions.map((s: any) => {
          const isPresent = presenceSet.has(`${student.id}_${s.id}`);
          if (isPresent) {
            presentCount += 1;
            return 'Present';
          }
          return 'Absent';
        });

        const totalSessions = sessions.length;
        const ratePct = totalSessions > 0 ? Math.round((presentCount / totalSessions) * 100) : 0;

        rows.push([
          index + 1,
          student.matric_number || 'N/A',
          student.name || 'N/A',
          ...(sessions.length > 0 ? dateStatuses : ['—']),
          presentCount,
          totalSessions,
          `${ratePct}%`,
        ]);
      });

      const cleanCode = (course.course_code || 'Course').replace(/[^a-zA-Z0-9_-]/g, '_');
      const dateSlug = formatDDMMYYYY(new Date()).replace(/\//g, '-');
      const filename = `${cleanCode}_Attendance_Register_${dateSlug}`;

      await exportCsv({
        filename,
        rows,
        dialogTitle: `Print / Share ${course.course_code} Attendance CSV`,
      });
    } catch (err: any) {
      console.error('Failed to export register CSV:', err);
      Alert.alert('Export Error', err?.message || 'Failed to export attendance register.');
    } finally {
      setExporting(false);
    }
  };

  const SECONDARY = colors.secondary;
  const s = makeStyles(colors);

  if (loading || !course) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color={SECONDARY} />
        <Text style={s.loadingText}>Loading course...</Text>
      </View>
    );
  }

  const totalEnrolled = students.length || 0;
  const presentStudents = presentStudentIds.size;
  const progressPercentage = totalEnrolled > 0 ? (presentStudents / totalEnrolled) * 100 : 0;

  const radius = 54;
  const strokeWidth = 10;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progressPercentage / 100) * circumference;
  const renderStudentItem = useCallback(
    ({ item, index }: { item: StudentRosterItem; index: number }) => {
      const studentId = item.student?.id;
      const isPresent = Boolean(activeSession && studentId && presentStudentIds.has(studentId));
      const isFirst = index === 0;
      const isLast = index === students.length - 1;

      return (
        <View
          style={[
            s.rosterRow,
            isFirst && s.rosterRowFirst,
            isLast ? s.rosterRowLast : s.rosterBorder,
          ]}
        >
          <View style={[s.rosterIcon, { backgroundColor: colors.secondaryDim }]}>
            <User size={16} color={SECONDARY} />
          </View>
          <View style={s.rosterInfo}>
            <Text style={s.rosterName}>{item.student?.name || 'Unknown'}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
              <Text style={s.rosterMatric}>{item.student?.matric_number || 'No matric no.'}</Text>
              {Boolean(isPresent && studentId && presentStudentDevices[studentId as string]) && (
                <View style={[s.deviceBadge, { backgroundColor: colors.secondaryDim }]}>
                  <Smartphone size={10} color={SECONDARY} />
                  <Text style={[s.deviceBadgeText, { color: SECONDARY }]} numberOfLines={1}>
                    {presentStudentDevices[studentId as string]}
                  </Text>
                </View>
              )}
            </View>
          </View>
          {isPresent && <View style={s.presentDot} />}
        </View>
      );
    },
    [activeSession, presentStudentIds, presentStudentDevices, students.length, colors, SECONDARY, s]
  );

  return (
    <View style={s.root}>

      {/* Header */}
      <View style={[s.header, { paddingTop: Math.max(insets.top, 20) + 12 }]}>
        <View style={s.headerRow}>
          <Pressable onPress={() => router.back()} style={s.backBtn}>
            <ChevronLeft size={22} color="#FFFFFF" />
          </Pressable>
          <View style={s.headerText}>
            <Text style={s.courseCode} numberOfLines={1}>{course.course_code}</Text>
            <Text style={s.courseTitle} numberOfLines={1}>{course.course_title}</Text>
          </View>
        </View>

        <View style={s.statsRow}>
          <View style={s.statChip}>
            <Text style={s.statNum}>{totalEnrolled}</Text>
            <Text style={s.statLabel}>Enrolled</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statChip}>
            <Text style={s.statNum}>{activeSession ? presentStudents : '—'}</Text>
            <Text style={s.statLabel}>Present</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statChip}>
            <Text style={s.statNum}>{activeSession ? Math.max(0, totalEnrolled - presentStudents) : '—'}</Text>
            <Text style={s.statLabel}>Absent</Text>
          </View>
        </View>
      </View>

      <FlatList
        data={students}
        keyExtractor={(item) => item.id}
        renderItem={renderStudentItem}
        ListHeaderComponent={
          <>

        {/* Session Card */}
        {activeSession ? (
          <View style={s.card}>
            <View style={s.liveHeader}>
              <View style={s.liveBadge}>
                <View style={s.liveDot} />
                <Text style={s.liveText}>SESSION LIVE</Text>
              </View>
              <Pressable onPress={handleRefresh} style={s.refreshBtn}>
                <RefreshCw size={18} color={SECONDARY} />
              </Pressable>
            </View>

            {/* Progress Ring */}
            <View style={s.ringWrapper}>
              <Svg width={140} height={140}>
                <Circle cx={70} cy={70} r={radius} stroke={colors.cardBorder} strokeWidth={strokeWidth} fill="none" />
                <Circle
                  cx={70} cy={70} r={radius}
                  stroke={SECONDARY} strokeWidth={strokeWidth}
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round" fill="none"
                  rotation="-90" origin="70, 70"
                />
              </Svg>
              <View style={s.ringCenter}>
                <Text style={[s.ringPct, { color: SECONDARY }]}>{Math.round(progressPercentage)}%</Text>
                <Text style={s.ringLabel}>Present</Text>
              </View>
            </View>

            <Text style={s.codeLabel}>Attendance Code</Text>
            <Text style={[s.codeValue, { color: SECONDARY }]}>{activeSession.attendance_code}</Text>

            {/* Scannable QR for students */}
            <View style={[s.qrBox, { borderColor: colors.cardBorder }]}>
              <QRCode
                value={activeSession.attendance_code}
                size={140}
                color={colors.text}
                backgroundColor={colors.card}
              />
            </View>
            <Text style={s.qrHint}>Students can scan this QR or type the code above</Text>

            <View style={s.timeRow}>
              <Clock size={14} color={colors.textMuted} />
              <Text style={s.timeText}>
                Ends {formatTime(activeSession.end_time)}
                {timeLeft ? ` (${timeLeft} remaining)` : ''}
              </Text>
            </View>

            {activeSession.latitude && activeSession.longitude ? (
              <View style={s.activeGeoBox}>
                <View style={s.geoBadge}>
                  <MapPin size={13} color={SECONDARY} />
                  <Text style={[s.geoBadgeText, { color: SECONDARY }]}>
                    Geofence: {activeSession.radius_meters || selectedRadius || 50}m Radius
                  </Text>
                </View>

                {/* Range Adjuster Buttons */}
                <View style={s.liveAdjustRow}>
                  <Text style={s.liveAdjustLabel}>Range:</Text>
                  <View style={s.liveChipRow}>
                    {RADIUS_OPTIONS.map((opt) => {
                      const cur = activeSession.radius_meters || selectedRadius || 50;
                      const isCur = cur === opt.value;
                      return (
                        <Pressable
                          key={opt.value}
                          onPress={() => handleUpdateLiveRadius(opt.value)}
                          style={[
                            s.liveChip,
                            isCur
                              ? { backgroundColor: SECONDARY, borderColor: SECONDARY }
                              : { backgroundColor: colors.card, borderColor: colors.cardBorder },
                          ]}
                        >
                          <Text
                            style={[
                              s.liveChipText,
                              isCur ? { color: '#FFFFFF', fontWeight: '700' } : { color: colors.textSub },
                            ]}
                          >
                            {opt.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              </View>
            ) : null}

            <Pressable onPress={endSession} style={s.endSessionBtn}>
              <XCircle size={15} color="#DC2626" />
              <Text style={s.endSessionBtnText}>Close Attendance Now</Text>
            </Pressable>
          </View>
        ) : (
          <View style={s.card}>
            <View style={s.placeholderBox}>
              <QRCode value={JSON.stringify({ courseId: id, code: 'WAITING' })} size={130} color={colors.text} />
            </View>
            <Text style={s.readyTitle}>Ready to Start?</Text>
            <Text style={s.readyBody}>Generate a unique session code for students to enter.</Text>

            {/* Geofence Radius Selector */}
            <View style={s.venueRadiusBox}>
              <View style={s.venueRadiusHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <MapPin size={14} color={SECONDARY} />
                  <Text style={s.venueRadiusTitle}>Venue Geofence Range</Text>
                </View>
                <Text style={[s.venueRadiusCurrent, { color: SECONDARY }]}>{selectedRadius}m</Text>
              </View>

              <View style={s.radiusChipsRow}>
                {RADIUS_OPTIONS.map((opt) => {
                  const isSel = selectedRadius === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setSelectedRadius(opt.value);
                      }}
                      style={[
                        s.radiusChip,
                        isSel
                          ? { backgroundColor: SECONDARY, borderColor: SECONDARY }
                          : { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder },
                      ]}
                    >
                      <Text style={[s.radiusChipText, isSel ? { color: '#FFFFFF' } : { color: colors.text }]}>
                        {opt.label}
                      </Text>
                      <Text
                        style={[
                          s.radiusChipSub,
                          isSel ? { color: 'rgba(255,255,255,0.85)' } : { color: colors.textMuted },
                        ]}
                      >
                        {opt.desc}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <Pressable onPress={startSession} style={[s.startBtn, { backgroundColor: SECONDARY }]}>
              <QrCode size={18} color="#FFF" />
              <Text style={s.startBtnText}>Start Session ({selectedRadius}m)</Text>
            </Pressable>
          </View>
        )}

        {/* Course Instructors / Teaching Team */}
        <View style={s.instructorsHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Shield size={16} color={SECONDARY} />
            <Text style={s.sectionTitle}>Teaching Team</Text>
            <View style={[s.countBadge, { backgroundColor: colors.secondaryDim }]}>
              <Text style={[s.countBadgeText, { color: SECONDARY }]}>
                {1 + instructors.coLecturers.length}
              </Text>
            </View>
          </View>

          {isLeadLecturer && (
            <Pressable
              onPress={handleOpenAddModal}
              style={[s.addCoLecturerBtn, { backgroundColor: colors.secondaryDim }]}
            >
              <UserPlus size={14} color={SECONDARY} />
              <Text style={[s.addCoLecturerText, { color: SECONDARY }]}>+ Add Co-Lecturer</Text>
            </Pressable>
          )}
        </View>

        <View style={s.instructorsCard}>
          {/* Lead Lecturer Card */}
          <View style={[s.instructorRow, instructors.coLecturers.length > 0 && s.rosterBorder]}>
            <View style={[s.instructorIcon, { backgroundColor: colors.secondaryDim }]}>
              <Shield size={18} color={SECONDARY} />
            </View>
            <View style={s.instructorInfo}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Text style={s.instructorName}>
                  {instructors.lead?.name || 'Lead Lecturer'}
                </Text>
                <View style={s.leadBadge}>
                  <Text style={s.leadBadgeText}>Coordinator</Text>
                </View>
              </View>
              <Text style={s.instructorSub}>
                {instructors.lead?.email || 'Department Coordinator'}
                {instructors.lead?.staff_id ? ` · Staff ID: ${instructors.lead.staff_id}` : ''}
              </Text>
            </View>
          </View>

          {/* Co-Lecturers */}
          {instructors.coLecturers.map((col, idx) => (
            <View
              key={col.lecturer_id}
              style={[s.instructorRow, idx < instructors.coLecturers.length - 1 && s.rosterBorder]}
            >
              <View style={[s.instructorIcon, { backgroundColor: colors.cardAlt }]}>
                <User size={18} color={colors.textSub} />
              </View>
              <View style={s.instructorInfo}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <Text style={s.instructorName}>{col.name}</Text>
                  <View style={s.coLecturerBadge}>
                    <Text style={s.coLecturerBadgeText}>Co-Lecturer</Text>
                  </View>
                </View>
                <Text style={s.instructorSub}>
                  {col.email || 'Department Staff'}
                  {col.staff_id ? ` · Staff ID: ${col.staff_id}` : ''}
                </Text>
              </View>

              {isLeadLecturer && (
                <Pressable
                  onPress={() => handleRemoveCoLecturer(col.lecturer_id, col.name)}
                  hitSlop={8}
                  style={s.removeBtn}
                >
                  <Trash2 size={16} color="#DC2626" />
                </Pressable>
              )}
            </View>
          ))}
        </View>

        {/* Roster */}
        <View style={s.rosterHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={s.sectionTitle}>Student Roster</Text>
            {refreshing && <ActivityIndicator size="small" color={SECONDARY} />}
          </View>
          <Pressable
            onPress={handleExportCSV}
            disabled={exporting || students.length === 0}
            style={[s.exportBtn, { backgroundColor: colors.secondaryDim }, (exporting || students.length === 0) && { opacity: 0.6 }]}
          >
            {exporting ? (
              <ActivityIndicator size="small" color={SECONDARY} />
            ) : (
              <>
                <Download size={14} color={SECONDARY} />
                <Text style={[s.exportText, { color: SECONDARY }]}>Print / Export CSV</Text>
              </>
            )}
          </Pressable>
        </View>

          </>
        }
        ListEmptyComponent={
          <View style={[s.card, s.emptyCard]}>
            <Users size={32} color={colors.textMuted} />
            <Text style={s.emptyText}>No students enrolled yet.</Text>
          </View>
        }
        style={s.scroll}
        contentContainerStyle={[
          s.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 24) + 24 },
        ]}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
        showsVerticalScrollIndicator={false}
      />

      {/* Add Co-Lecturer Modal */}
      <Modal
        visible={showAddLecturerModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowAddLecturerModal(false)}
      >
        <View style={s.modalOverlay}>
          <Pressable
            style={s.modalBackdrop}
            onPress={() => setShowAddLecturerModal(false)}
          />
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <View>
                <Text style={s.modalTitle}>Add Co-Lecturer</Text>
                <Text style={s.modalSubtitle}>
                  Assign a departmental colleague to teach {course?.course_code}
                </Text>
              </View>
              <Pressable
                onPress={() => setShowAddLecturerModal(false)}
                style={s.modalCloseBtn}
              >
                <X size={18} color={colors.textSub} />
              </Pressable>
            </View>

            {/* Search Input */}
            <View style={s.searchBar}>
              <Search size={16} color={colors.textMuted} />
              <TextInput
                style={s.searchInput}
                placeholder="Search by lecturer name or email..."
                placeholderTextColor={colors.textMuted}
                value={searchLecturerText}
                onChangeText={handleSearchLecturers}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {searchLecturerText.length > 0 && (
                <Pressable onPress={() => handleSearchLecturers('')} hitSlop={6}>
                  <X size={14} color={colors.textMuted} />
                </Pressable>
              )}
            </View>

            {/* Search Results List */}
            <ScrollView style={s.modalList} contentContainerStyle={{ paddingBottom: 16 }}>
              {searchingLecturers ? (
                <View style={s.modalLoadingBox}>
                  <ActivityIndicator size="small" color={SECONDARY} />
                  <Text style={s.modalLoadingText}>Searching lecturers...</Text>
                </View>
              ) : availableLecturers.length === 0 ? (
                <View style={s.modalEmptyBox}>
                  <Users size={32} color={colors.textMuted} />
                  <Text style={s.modalEmptyText}>
                    {searchLecturerText
                      ? 'No matching lecturers found.'
                      : 'No other lecturers available in this department.'}
                  </Text>
                </View>
              ) : (
                availableLecturers.map((lec) => {
                  const isAdding = addingLecturerId === lec.id;
                  return (
                    <View key={lec.id} style={s.lecturerResultItem}>
                      <View style={[s.lecturerAvatar, { backgroundColor: colors.secondaryDim }]}>
                        <Text style={[s.lecturerAvatarText, { color: SECONDARY }]}>
                          {(lec.name || 'L').charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={s.lecturerResultInfo}>
                        <Text style={s.lecturerResultName}>{lec.name}</Text>
                        <Text style={s.lecturerResultEmail} numberOfLines={1}>
                          {lec.email}
                        </Text>
                        {lec.staff_id ? (
                          <Text style={s.lecturerResultStaffId}>ID: {lec.staff_id}</Text>
                        ) : null}
                      </View>
                      <Pressable
                        onPress={() => handleAddCoLecturer(lec.id)}
                        disabled={isAdding}
                        style={[s.assignBtn, { backgroundColor: SECONDARY }]}
                      >
                        {isAdding ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <>
                            <UserPlus size={14} color="#FFFFFF" />
                            <Text style={s.assignBtnText}>Assign</Text>
                          </>
                        )}
                      </Pressable>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function makeStyles(c: ReturnType<typeof import('../../../context/ThemeContext').useTheme>['colors']) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    centered: { flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', gap: 12 },
    loadingText: { fontSize: 15, color: c.textSub, fontFamily: ff ? 'sans-serif' : undefined },

    // Header
    header: {
      backgroundColor: c.secondary, paddingHorizontal: 20, paddingBottom: 20,
      borderBottomLeftRadius: 28, borderBottomRightRadius: 28,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
    backBtn: {
      width: 38, height: 38, backgroundColor: 'rgba(0,0,0,0.2)',
      borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginRight: 12,
    },
    headerText: { flex: 1 },
    courseCode: { fontSize: 20, fontWeight: '700', color: '#FFF', fontFamily: ff ? 'sans-serif-medium' : undefined },
    courseTitle: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 2, fontFamily: ff ? 'sans-serif' : undefined },
    statsRow: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 16, padding: 14,
    },
    statChip: { flex: 1, alignItems: 'center' },
    statNum: { fontSize: 22, fontWeight: '700', color: '#FFF', fontFamily: ff ? 'sans-serif-medium' : undefined },
    statLabel: { fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: 2, fontFamily: ff ? 'sans-serif' : undefined },
    statDivider: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.3)' },

    scroll: { flex: 1 },
    scrollContent: { padding: 20, paddingBottom: 40 },

    // Card
    card: {
      backgroundColor: c.card, borderRadius: 20, padding: 20,
      borderWidth: 1, borderColor: c.cardBorder, marginBottom: 20,
      alignItems: 'center',
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
    },

    // Live session
    liveHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 16 },
    liveBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEE2E2', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
    liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444', marginRight: 6 },
    liveText: { fontSize: 12, fontWeight: '700', color: '#DC2626', letterSpacing: 1, fontFamily: ff ? 'sans-serif-medium' : undefined },
    refreshBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.secondaryDim, alignItems: 'center', justifyContent: 'center' },
    ringWrapper: { position: 'relative', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    ringCenter: { position: 'absolute', alignItems: 'center' },
    ringPct: { fontSize: 26, fontWeight: '700', fontFamily: ff ? 'sans-serif-medium' : undefined },
    ringLabel: { fontSize: 11, color: c.textMuted, marginTop: 2, fontFamily: ff ? 'sans-serif' : undefined },
    codeLabel: { fontSize: 13, color: c.textMuted, marginBottom: 6, fontFamily: ff ? 'sans-serif' : undefined },
    codeValue: { fontSize: 38, fontWeight: '900', letterSpacing: 10, marginBottom: 8, fontFamily: ff ? 'sans-serif-medium' : undefined },
    timeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    timeText: { fontSize: 13, color: c.textMuted, fontFamily: ff ? 'sans-serif' : undefined },
    activeGeoBox: {
      width: '100%',
      backgroundColor: c.cardAlt,
      borderRadius: 14,
      padding: 10,
      marginTop: 10,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: c.cardBorder,
    },
    geoBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.secondaryDim,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      gap: 6,
    },
    geoBadgeText: {
      fontSize: 12,
      fontWeight: '600',
      fontFamily: ff ? 'sans-serif-medium' : undefined,
    },
    liveAdjustRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: 8,
    },
    liveAdjustLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: c.textMuted,
      fontFamily: ff ? 'sans-serif-medium' : undefined,
    },
    liveChipRow: {
      flexDirection: 'row',
      gap: 6,
    },
    liveChip: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
      borderWidth: 1,
    },
    liveChipText: {
      fontSize: 11,
      fontWeight: '600',
      fontFamily: ff ? 'sans-serif-medium' : undefined,
    },
    venueRadiusBox: {
      width: '100%',
      backgroundColor: c.cardAlt,
      borderRadius: 16,
      padding: 12,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: c.cardBorder,
    },
    venueRadiusHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
    },
    venueRadiusTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: c.text,
      fontFamily: ff ? 'sans-serif-medium' : undefined,
    },
    venueRadiusCurrent: {
      fontSize: 13,
      fontWeight: '700',
      fontFamily: ff ? 'sans-serif-medium' : undefined,
    },
    radiusChipsRow: {
      flexDirection: 'row',
      gap: 6,
    },
    radiusChip: {
      flex: 1,
      paddingVertical: 8,
      paddingHorizontal: 4,
      borderRadius: 12,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radiusChipText: {
      fontSize: 13,
      fontWeight: '700',
      fontFamily: ff ? 'sans-serif-medium' : undefined,
    },
    radiusChipSub: {
      fontSize: 9,
      marginTop: 2,
      textAlign: 'center',
      fontFamily: ff ? 'sans-serif' : undefined,
    },
    endSessionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: '#FEE2E2',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      marginTop: 12,
    },
    endSessionBtnText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#DC2626',
      fontFamily: ff ? 'sans-serif-medium' : undefined,
    },
    qrBox: { marginVertical: 14, padding: 12, borderRadius: 16, borderWidth: 1, backgroundColor: c.card },
    qrHint: { fontSize: 12, color: c.textMuted, textAlign: 'center', marginBottom: 8, fontFamily: ff ? 'sans-serif' : undefined },

    placeholderBox: {
      width: 160, height: 160, backgroundColor: c.cardAlt, borderRadius: 16,
      alignItems: 'center', justifyContent: 'center', marginBottom: 16, padding: 12,
    },
    readyTitle: { fontSize: 18, fontWeight: '700', color: c.text, marginBottom: 6, fontFamily: ff ? 'sans-serif-medium' : undefined },
    readyBody: { fontSize: 13, color: c.textSub, textAlign: 'center', marginBottom: 18, lineHeight: 20, fontFamily: ff ? 'sans-serif' : undefined },
    startBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 999, gap: 8, elevation: 2 },
    startBtnText: { color: '#FFF', fontWeight: '700', fontSize: 16, fontFamily: ff ? 'sans-serif-medium' : undefined },

    // Roster
    rosterHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    sectionTitle: { fontSize: 17, fontWeight: '700', color: c.text, fontFamily: ff ? 'sans-serif-medium' : undefined },
    exportBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, gap: 6 },
    exportText: { fontSize: 12, fontWeight: '600', fontFamily: ff ? 'sans-serif-medium' : undefined },
    emptyCard: { gap: 10 },
    emptyText: { fontSize: 14, color: c.textSub, fontFamily: ff ? 'sans-serif' : undefined },
    rosterCard: {
      backgroundColor: c.card, borderRadius: 18, overflow: 'hidden',
      borderWidth: 1, borderColor: c.cardBorder,
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
    },
    rosterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 14,
      backgroundColor: c.card,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: c.cardBorder,
    },
    rosterRowFirst: {
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      borderTopWidth: 1,
    },
    rosterRowLast: {
      borderBottomLeftRadius: 18,
      borderBottomRightRadius: 18,
      borderBottomWidth: 1,
      marginBottom: 20,
    },
    rosterBorder: { borderBottomWidth: 1, borderBottomColor: c.cardBorder },
    rosterIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    rosterInfo: { flex: 1 },
    rosterName: { fontSize: 14, fontWeight: '600', color: c.text, fontFamily: ff ? 'sans-serif-medium' : undefined },
    rosterMatric: { fontSize: 12, color: c.textMuted, fontFamily: ff ? 'sans-serif' : undefined },
    deviceBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
    },
    deviceBadgeText: {
      fontSize: 10,
      fontWeight: '600',
      fontFamily: ff ? 'sans-serif-medium' : undefined,
    },
    presentDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#1B6B3A' },

    // Teaching Team / Instructors
    instructorsHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
      marginTop: 8,
    },
    countBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 12,
    },
    countBadgeText: {
      fontSize: 11,
      fontWeight: '700',
      fontFamily: ff ? 'sans-serif-medium' : undefined,
    },
    addCoLecturerBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      gap: 5,
    },
    addCoLecturerText: {
      fontSize: 12,
      fontWeight: '600',
      fontFamily: ff ? 'sans-serif-medium' : undefined,
    },
    instructorsCard: {
      backgroundColor: c.card,
      borderRadius: 18,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: c.cardBorder,
      marginBottom: 24,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 4,
      elevation: 1,
    },
    instructorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 14,
    },
    instructorIcon: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    instructorInfo: {
      flex: 1,
    },
    instructorName: {
      fontSize: 14,
      fontWeight: '700',
      color: c.text,
      fontFamily: ff ? 'sans-serif-medium' : undefined,
    },
    instructorSub: {
      fontSize: 12,
      color: c.textMuted,
      marginTop: 2,
      fontFamily: ff ? 'sans-serif' : undefined,
    },
    leadBadge: {
      backgroundColor: '#FEF3C7',
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 6,
    },
    leadBadgeText: {
      fontSize: 10,
      fontWeight: '700',
      color: '#92400E',
      fontFamily: ff ? 'sans-serif-medium' : undefined,
    },
    coLecturerBadge: {
      backgroundColor: '#E0E7FF',
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 6,
    },
    coLecturerBadgeText: {
      fontSize: 10,
      fontWeight: '700',
      color: '#3730A3',
      fontFamily: ff ? 'sans-serif-medium' : undefined,
    },
    removeBtn: {
      padding: 8,
      borderRadius: 8,
    },

    // Modal
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    modalBackdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    modalContent: {
      width: '100%',
      maxHeight: '80%',
      backgroundColor: c.card,
      borderRadius: 20,
      padding: 20,
      borderWidth: 1,
      borderColor: c.cardBorder,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 5,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 16,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: c.text,
      fontFamily: ff ? 'sans-serif-medium' : undefined,
    },
    modalSubtitle: {
      fontSize: 12,
      color: c.textSub,
      marginTop: 3,
      fontFamily: ff ? 'sans-serif' : undefined,
    },
    modalCloseBtn: {
      padding: 6,
      borderRadius: 14,
      backgroundColor: c.cardAlt,
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.cardAlt,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: c.cardBorder,
      marginBottom: 14,
      gap: 8,
    },
    searchInput: {
      flex: 1,
      fontSize: 14,
      color: c.text,
      paddingVertical: 2,
    },
    modalList: {
      maxHeight: 320,
    },
    modalLoadingBox: {
      padding: 32,
      alignItems: 'center',
      gap: 10,
    },
    modalLoadingText: {
      fontSize: 13,
      color: c.textMuted,
      fontFamily: ff ? 'sans-serif' : undefined,
    },
    modalEmptyBox: {
      padding: 32,
      alignItems: 'center',
      gap: 8,
    },
    modalEmptyText: {
      fontSize: 13,
      color: c.textMuted,
      textAlign: 'center',
      fontFamily: ff ? 'sans-serif' : undefined,
    },
    lecturerResultItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: c.cardBorder,
      gap: 12,
    },
    lecturerAvatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
    },
    lecturerAvatarText: {
      fontSize: 16,
      fontWeight: '700',
    },
    lecturerResultInfo: {
      flex: 1,
    },
    lecturerResultName: {
      fontSize: 14,
      fontWeight: '600',
      color: c.text,
      fontFamily: ff ? 'sans-serif-medium' : undefined,
    },
    lecturerResultEmail: {
      fontSize: 12,
      color: c.textMuted,
      fontFamily: ff ? 'sans-serif' : undefined,
    },
    lecturerResultStaffId: {
      fontSize: 11,
      color: c.textMuted,
      fontFamily: ff ? 'sans-serif' : undefined,
    },
    assignBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
      gap: 5,
    },
    assignBtnText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '700',
      fontFamily: ff ? 'sans-serif-medium' : undefined,
    },
  });
}
