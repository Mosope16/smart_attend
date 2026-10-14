import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, Platform, StatusBar, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Calendar, Check, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUser } from '../../context/AuthContext';
import { useSupabaseClient } from '../../lib/supabase';
import { useTheme } from '../../context/ThemeContext';
import { formatDateTime, parseSafeDate } from '../../lib/dateUtils';
import { AttendanceHistoryItem, DatabaseEnrollment, DatabaseAttendanceSession, DatabaseAttendanceRecord, DatabaseCourse } from '../../types/database';

const ff = Platform.OS === 'android';

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { user } = useUser();
  const supabase = useSupabaseClient();
  const PRIMARY = colors.primary;

  const [records, setRecords] = useState<AttendanceHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      StatusBar.setBarStyle('light-content');
      if (Platform.OS === 'android') StatusBar.setBackgroundColor(isDark ? '#0D3320' : PRIMARY);
      fetchHistory();
    }, [isDark, PRIMARY, user?.id])
  );

  // Real-time listener: refresh automatically when attendance is recorded
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`student_history_records_${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'attendance_records' },
        (payload: any) => {
          if (payload?.new?.student_id === user.id) {
            fetchHistory();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, supabase]);

  const fetchHistory = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // 1. Get all courses the student is enrolled in
      const { data: enrollmentRows } = await supabase
        .from('enrollments')
        .select('course_id')
        .eq('student_id', user.id);
      
      const enrollments = (enrollmentRows as Pick<DatabaseEnrollment, 'course_id'>[]) || [];
      const courseIds = enrollments.map((e) => e.course_id);

      if (courseIds.length === 0) {
        setRecords([]);
        setLoading(false);
        return;
      }

      // 2. Get all sessions for these courses
      const { data: sessionData } = await supabase
        .from('attendance_sessions')
        .select('id, start_time, end_time, course:course_id ( course_code, course_title )')
        .in('course_id', courseIds);
      
      const sessions = (sessionData as (Pick<DatabaseAttendanceSession, 'id' | 'start_time' | 'end_time'> & { course?: Pick<DatabaseCourse, 'course_code' | 'course_title'> | null })[]) || [];

      // 3. Get all attendance records for this student
      const { data: recordsData } = await supabase
        .from('attendance_records')
        .select('session_id, status, timestamp')
        .eq('student_id', user.id);
      
      const recordsMap = new Map<string, Pick<DatabaseAttendanceRecord, 'session_id' | 'status' | 'timestamp'>>(
        (recordsData as Pick<DatabaseAttendanceRecord, 'session_id' | 'status' | 'timestamp'>[])?.map((r) => [r.session_id, r]) || []
      );

      // 4. Combine them into a history array
      const history: AttendanceHistoryItem[] = [];
      const now = new Date().toISOString();

      for (const session of sessions) {
        const record = recordsMap.get(session.id);
        
        if (record) {
          history.push({
            id: session.id, // Using session id as unique key
            course: session.course,
            status: record.status, // e.g. 'present'
            timestamp: record.timestamp, // When they marked it
          });
        } else if (session.end_time < now) {
          // If the session has ended and there is no record, they are absent
          history.push({
            id: session.id,
            course: session.course,
            status: 'absent',
            timestamp: session.end_time, // Use session end time for sorting absent records
          });
        }
      }

      // Sort history by timestamp descending (newest first) safely
      history.sort((a, b) => parseSafeDate(b.timestamp).getTime() - parseSafeDate(a.timestamp).getTime());

      setRecords(history);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const { presentCount, absentCount, pct } = React.useMemo(() => {
    let present = 0;
    let absent = 0;
    for (const r of records) {
      if (r.status === 'present') present++;
      else if (r.status === 'absent') absent++;
    }
    const rate = records.length > 0 ? Math.round((present / records.length) * 100) : 0;
    return { presentCount: present, absentCount: absent, pct: rate };
  }, [records]);

  const s = makeStyles(colors);

  const renderHistoryItem = useCallback(({ item: record }: { item: AttendanceHistoryItem }) => {
    const isPresent = record.status === 'present';
    const course = record.course;
    return (
      <View style={s.sessionCard}>
        <View style={[s.sessionIcon, { backgroundColor: isPresent ? colors.primaryDim : (isDark ? '#450a0a' : '#FEF2F2') }]}>
          <Calendar size={22} color={isPresent ? PRIMARY : '#EF4444'} />
        </View>
        <View style={s.sessionInfo}>
          <Text style={s.sessionCourse}>{course?.course_code ?? 'Unknown'}</Text>
          <Text style={s.sessionDate}>
            {formatDateTime(record.timestamp)}
          </Text>
        </View>
        <View style={[s.statusBadge, { backgroundColor: isPresent ? colors.primaryDim : (isDark ? '#450a0a' : '#FEF2F2') }]}>
          {isPresent
            ? <Check size={13} color={colors.primaryText} />
            : <X size={13} color="#EF4444" />
          }
          <Text style={[s.statusText, { color: isPresent ? colors.primaryText : '#EF4444' }]}>
            {isPresent ? 'Present' : 'Absent'}
          </Text>
        </View>
      </View>
    );
  }, [colors, isDark, PRIMARY, s]);

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: Math.max(insets.top, 20) + 12 }]}>
        <Text style={s.headerTitle}>Attendance History</Text>
        <View style={s.pillRow}>
          <View style={[s.pill, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
            <Text style={s.pillNum}>{pct}%</Text>
            <Text style={s.pillLabel}>Attendance</Text>
          </View>
          <View style={[s.pill, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
            <Text style={s.pillNum}>{presentCount}</Text>
            <Text style={s.pillLabel}>Present</Text>
          </View>
          <View style={[s.pill, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
            <Text style={s.pillNum}>{absentCount}</Text>
            <Text style={s.pillLabel}>Absent</Text>
          </View>
        </View>
      </View>

      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator color={PRIMARY} size="large" />
        </View>
      ) : records.length === 0 ? (
        <View style={s.centered}>
          <Calendar size={40} color={colors.textMuted} />
          <Text style={s.emptyText}>No attendance records yet.</Text>
          <Text style={s.emptySubText}>Records will appear after you mark attendance.</Text>
        </View>
      ) : (
        <FlatList
          data={records}
          keyExtractor={(item) => item.id}
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={ItemSeparator}
          renderItem={renderHistoryItem}
        />
      )}
    </View>
  );
}

const ItemSeparator = () => <View style={{ height: 10 }} />;

function makeStyles(c: ReturnType<typeof import('../../context/ThemeContext').useTheme>['colors']) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    header: {
      backgroundColor: c.primary, paddingHorizontal: 20, paddingBottom: 24,
      borderBottomLeftRadius: 28, borderBottomRightRadius: 28,
    },
    headerTitle: { fontSize: 22, fontWeight: '700', color: '#FFFFFF', marginBottom: 16, fontFamily: ff ? 'sans-serif-medium' : undefined },
    pillRow: { flexDirection: 'row', gap: 10 },
    pill: { flex: 1, borderRadius: 14, padding: 12, alignItems: 'center' },
    pillNum: { fontSize: 20, fontWeight: '700', color: '#FFFFFF', fontFamily: ff ? 'sans-serif-medium' : undefined },
    pillLabel: { fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: 2, fontFamily: ff ? 'sans-serif' : undefined },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    emptyText: { fontSize: 16, fontWeight: '600', color: c.text, fontFamily: ff ? 'sans-serif-medium' : undefined },
    emptySubText: { fontSize: 13, color: c.textSub, textAlign: 'center', paddingHorizontal: 40, fontFamily: ff ? 'sans-serif' : undefined },
    scroll: { flex: 1 },
    scrollContent: { padding: 20, paddingBottom: 32 },
    sessionCard: {
      backgroundColor: c.card, borderRadius: 16, padding: 14,
      flexDirection: 'row', alignItems: 'center',
      borderWidth: 1, borderColor: c.cardBorder,
    },
    sessionIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    sessionInfo: { flex: 1 },
    sessionCourse: { fontSize: 15, fontWeight: '700', color: c.text, marginBottom: 3, fontFamily: ff ? 'sans-serif-medium' : undefined },
    sessionDate: { fontSize: 12, color: c.textMuted, fontFamily: ff ? 'sans-serif' : undefined },
    statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, gap: 4 },
    statusText: { fontSize: 12, fontWeight: '600', fontFamily: ff ? 'sans-serif-medium' : undefined },
  });
}
