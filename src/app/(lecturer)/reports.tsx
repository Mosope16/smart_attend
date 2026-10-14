import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Platform, StatusBar, ActivityIndicator, Pressable, Alert, FlatList, RefreshControl,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Download, BarChart3 } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUser } from '../../context/AuthContext';
import { useSupabaseClient, executeSql } from '../../lib/supabase';
import { fetchLecturerCourses, LecturerCourse } from '../../lib/courseService';
import { useTheme } from '../../context/ThemeContext';
import { exportCsv } from '../../lib/exportCsv';
import { formatDDMMYYYY } from '../../lib/dateUtils';
import { StudentReportStat, DatabaseAttendanceSession, DatabaseAttendanceRecord } from '../../types/database';

const ff = Platform.OS === 'android';

export default function ReportsScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { user } = useUser();
  const supabase = useSupabaseClient();
  const SECONDARY = colors.secondary;

  const [courses, setCourses] = useState<LecturerCourse[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<LecturerCourse | null>(null);
  const [studentStats, setStudentStats] = useState<StudentReportStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      StatusBar.setBarStyle('light-content');
      if (Platform.OS === 'android') StatusBar.setBackgroundColor(isDark ? '#071A40' : SECONDARY);
      fetchCourses();
    }, [isDark, SECONDARY, user?.id])
  );

  const fetchCourses = async (isRefresh = false) => {
    if (!user) return;
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    const data = await fetchLecturerCourses(user.id);
    if (data && data.length > 0) {
      setCourses(data);
      const activeCurrent = selectedCourse
        ? data.find((c) => c.id === selectedCourse.id) || data[0]
        : data[0];
      setSelectedCourse(activeCurrent);
      await fetchStats(activeCurrent.id);
    } else {
      setCourses([]);
      setSelectedCourse(null);
      setStudentStats([]);
    }
    setLoading(false);
    setRefreshing(false);
  };

  const handleRefresh = useCallback(() => {
    fetchCourses(true);
  }, [selectedCourse, user?.id]);

  const fetchStats = async (courseId: string) => {
    // Get all sessions for this course
    const { data: sessionRows } = await supabase
      .from('attendance_sessions')
      .select('id')
      .eq('course_id', courseId);

    const sessions = (sessionRows as Pick<DatabaseAttendanceSession, 'id'>[]) ?? [];
    const sessionIds = sessions.map((s) => s.id);
    const totalSessions = sessionIds.length;

    // Get enrollments with student info
    const { data: enrollmentRows } = await supabase
      .from('enrollments')
      .select('student:student_id ( id, name, matric_number )')
      .eq('course_id', courseId);

    if (!enrollmentRows) { setStudentStats([]); return; }

    // Batch aggregate student attendance counts to eliminate N+1 query loop
    const studentPresentMap = new Map<string, number>();

    if (totalSessions > 0 && sessionIds.length > 0) {
      const sessionList = sessionIds.map((id: string) => `'${String(id).replace(/'/g, "''")}'`).join(', ');
      const { data: aggData, error: aggErr } = await executeSql<{ student_id: string; count: number }>(
        `SELECT student_id, COUNT(*)::int as count FROM public.attendance_records WHERE session_id IN (${sessionList}) AND status = 'present' GROUP BY student_id;`
      );

      if (!aggErr && aggData) {
        aggData.forEach((row) => {
          if (row.student_id) {
            studentPresentMap.set(row.student_id, Number(row.count) || 0);
          }
        });
      }
    }

    const stats: StudentReportStat[] = enrollmentRows.map((e: any) => {
      const studentId = e.student?.id;
      const count = studentId ? (studentPresentMap.get(studentId) ?? 0) : 0;
      const pct = totalSessions > 0 ? Math.round((count / totalSessions) * 100) : 0;
      return {
        id: studentId ?? Math.random().toString(),
        name: e.student?.name ?? 'Unknown',
        matric: e.student?.matric_number ?? 'Unknown',
        present: count,
        total: totalSessions,
        attendance: pct,
      };
    });

    setStudentStats(stats.sort((a, b) => b.attendance - a.attendance));
  };

  const avgAttendance = studentStats.length > 0
    ? Math.round(studentStats.reduce((sum, s) => sum + s.attendance, 0) / studentStats.length)
    : 0;

  const handlePrintCSV = async () => {
    if (!selectedCourse) {
      Alert.alert('No Course Selected', 'Please select a course to export.');
      return;
    }
    if (studentStats.length === 0) {
      Alert.alert('No Student Data', 'There are no enrolled students or sessions to export for this course.');
      return;
    }

    try {
      setExporting(true);

      // 1. Fetch all attendance sessions for this course, ordered chronologically starting with the first lecture
      const { data: allSessions, error: sessErr } = await supabase
        .from('attendance_sessions')
        .select('id, start_time, end_time, created_at, lecturer:lecturer_id ( name )')
        .eq('course_id', selectedCourse.id)
        .order('start_time', { ascending: true });

      if (sessErr) {
        console.warn('Error fetching all course sessions:', sessErr);
      }

      const sessions = (allSessions as (Pick<DatabaseAttendanceSession, 'id' | 'start_time' | 'end_time' | 'created_at'> & { lecturer?: { name?: string } | null })[]) ?? [];
      const sessionIds = sessions.map((s) => s.id);

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

        const records = (recordsData as Pick<DatabaseAttendanceRecord, 'student_id' | 'session_id' | 'status'>[]) ?? [];
        records.forEach((r) => {
          if (r.student_id && r.session_id) {
            presenceSet.add(`${r.student_id}_${r.session_id}`);
          }
        });
      }

      // 3. Format date headers (dd/mm/yyyy), disambiguating multiple sessions on the same date
      const dateCountMap = new Map<string, number>();
      sessions.forEach((s) => {
        const d = formatDDMMYYYY(s.start_time || s.created_at);
        dateCountMap.set(d, (dateCountMap.get(d) || 0) + 1);
      });

      const dateSeenMap = new Map<string, number>();
      const sessionDateHeaders = sessions.map((s) => {
        const d = formatDDMMYYYY(s.start_time || s.created_at);
        const lecturerSuffix = s.lecturer?.name ? ` (${s.lecturer.name})` : '';
        const count = dateCountMap.get(d) || 0;
        if (count > 1) {
          const seen = (dateSeenMap.get(d) || 0) + 1;
          dateSeenMap.set(d, seen);
          return `${d} #${seen}${lecturerSuffix}`;
        }
        return `${d}${lecturerSuffix}`;
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

      // 5. Sort enrolled students consistently by Matric No., then Name
      const sortedStudents = [...studentStats].sort((a, b) => {
        const matA = (a.matric || '').trim().toLowerCase();
        const matB = (b.matric || '').trim().toLowerCase();
        if (matA && matB) return matA.localeCompare(matB, undefined, { numeric: true });
        const nameA = (a.name || '').trim().toLowerCase();
        const nameB = (b.name || '').trim().toLowerCase();
        return nameA.localeCompare(nameB);
      });

      // 6. Build Student Rows with 'Present' or 'Absent' under each date
      const rows: (string | number)[][] = [headers];

      sortedStudents.forEach((st, idx) => {
        let presentCount = 0;
        const dateStatuses = sessions.map((s) => {
          const isPresent = presenceSet.has(`${st.id}_${s.id}`);
          if (isPresent) {
            presentCount += 1;
            return 'Present';
          }
          return 'Absent';
        });

        const totalSessions = sessions.length;
        const ratePct = totalSessions > 0 ? Math.round((presentCount / totalSessions) * 100) : 0;

        rows.push([
          idx + 1,
          st.matric || 'N/A',
          st.name || 'N/A',
          ...(sessions.length > 0 ? dateStatuses : ['—']),
          presentCount,
          totalSessions,
          `${ratePct}%`,
        ]);
      });

      const cleanCode = (selectedCourse.course_code || 'Course').replace(/[^a-zA-Z0-9_-]/g, '_');
      const dateSlug = formatDDMMYYYY(new Date()).replace(/\//g, '-');
      const filename = `${cleanCode}_Attendance_Register_${dateSlug}`;

      await exportCsv({
        filename,
        rows,
        dialogTitle: `Print / Share ${selectedCourse.course_code} Attendance CSV`,
      });
    } catch (err: any) {
      console.error('Failed to export register CSV:', err);
      Alert.alert('Export Error', err?.message || 'Failed to export attendance register.');
    } finally {
      setExporting(false);
    }
  };

  const s = makeStyles(colors);

  const renderStudentStatItem = useCallback(
    ({ item, index }: { item: StudentReportStat; index: number }) => {
      const atRisk = item.attendance < 75;
      const isFirst = index === 0;
      const isLast = index === studentStats.length - 1;
      return (
        <View
          key={item.id}
          style={[
            s.studentRow,
            isFirst && s.studentRowFirst,
            isLast ? s.studentRowLast : s.studentRowBorder,
          ]}
        >
          <View style={[s.studentInitial, { backgroundColor: atRisk ? (isDark ? '#450a0a' : '#FEF2F2') : colors.secondaryDim }]}>
            <Text style={[s.studentInitialText, { color: atRisk ? '#EF4444' : SECONDARY }]}>
              {item.name?.charAt(0) ?? '?'}
            </Text>
          </View>
          <View style={s.studentInfo}>
            <Text style={s.studentName}>{item.name}</Text>
            <Text style={s.studentMatric}>{item.matric ?? '—'} · {item.present}/{item.total} sessions</Text>
          </View>
          <View style={[s.attendanceBadge, { backgroundColor: atRisk ? (isDark ? '#450a0a' : '#FEF2F2') : colors.primaryDim }]}>
            <Text style={[s.attendanceText, { color: atRisk ? '#EF4444' : colors.primaryText }]}>
              {item.attendance}%
            </Text>
          </View>
        </View>
      );
    },
    [studentStats.length, isDark, colors.secondaryDim, colors.primaryDim, colors.primaryText, SECONDARY, s]
  );

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={[s.header, { paddingTop: Math.max(insets.top, 20) + 12 }]}>
        <View>
          <Text style={s.headerTitle}>Reports</Text>
          <Text style={s.headerSub}>Attendance analytics & export</Text>
        </View>
        {courses.length > 0 && (
          <Pressable
            onPress={handlePrintCSV}
            disabled={exporting || studentStats.length === 0}
            style={[s.headerPrintBtn, (exporting || studentStats.length === 0) && { opacity: 0.5 }]}
          >
            {exporting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Download size={16} color="#FFFFFF" />
                <Text style={s.headerPrintText}>Print CSV</Text>
              </>
            )}
          </Pressable>
        )}
      </View>

      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator color={SECONDARY} size="large" />
        </View>
      ) : courses.length === 0 ? (
        <View style={s.centered}>
          <BarChart3 size={40} color={colors.textMuted} />
          <Text style={s.emptyTitle}>No courses yet</Text>
          <Text style={s.emptySub}>Create a course to see attendance reports.</Text>
        </View>
      ) : (
        <FlatList
          data={studentStats}
          keyExtractor={(item) => item.id}
          renderItem={renderStudentStatItem}
          ListHeaderComponent={
            <>
              {/* Course Tabs */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {courses.map((c) => {
                    const isSel = selectedCourse?.id === c.id;
                    return (
                      <Pressable
                        key={c.id}
                        onPress={() => {
                          setSelectedCourse(c);
                          fetchStats(c.id);
                        }}
                        style={[s.courseTab, isSel && { backgroundColor: SECONDARY, borderColor: SECONDARY }]}
                      >
                        <Text
                          style={[s.courseTabText, isSel && { color: '#FFF' }]}
                        >
                          {c.course_code}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>

              {/* Average Card */}
              <View style={s.avgCard}>
                <Text style={s.avgLabel}>Average Class Attendance</Text>
                <Text style={s.avgNum}>{avgAttendance}%</Text>
                <View style={s.progressBg}>
                  <View style={[s.progressFill, { width: `${Math.min(100, Math.max(0, avgAttendance))}%` }]} />
                </View>
                <View style={s.legendRow}>
                  <View style={s.legendItem}>
                    <View style={[s.legendDot, { backgroundColor: colors.primary }]} />
                    <Text style={s.legendText}>{studentStats.filter((s) => s.attendance >= 75).length} On Track</Text>
                  </View>
                  <View style={s.legendItem}>
                    <View style={[s.legendDot, { backgroundColor: '#EF4444' }]} />
                    <Text style={s.legendText}>{studentStats.filter((s) => s.attendance < 75).length} At Risk</Text>
                  </View>
                </View>
              </View>

              {/* Student List Section */}
              <View style={s.sectionHeaderRow}>
                <Text style={s.sectionLabel}>Student Breakdown</Text>
                {studentStats.length > 0 && (
                  <Pressable
                    onPress={handlePrintCSV}
                    disabled={exporting}
                    style={[s.sectionPrintBtn, { backgroundColor: colors.secondaryDim }]}
                  >
                    {exporting ? (
                      <ActivityIndicator size="small" color={SECONDARY} />
                    ) : (
                      <>
                        <Download size={14} color={SECONDARY} />
                        <Text style={[s.sectionPrintText, { color: SECONDARY }]}>Print CSV</Text>
                      </>
                    )}
                  </Pressable>
                )}
              </View>
            </>
          }
          ListEmptyComponent={
            <View style={s.noStudents}>
              <Text style={s.noStudentsText}>No enrolled students or no sessions yet.</Text>
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={SECONDARY}
              colors={[SECONDARY]}
            />
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
      )}
    </View>
  );
}

function makeStyles(c: ReturnType<typeof import('../../context/ThemeContext').useTheme>['colors']) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    header: {
      backgroundColor: c.secondary, paddingHorizontal: 20, paddingBottom: 20,
      borderBottomLeftRadius: 28, borderBottomRightRadius: 28,
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    },
    headerTitle: { fontSize: 22, fontWeight: '700', color: '#FFFFFF', fontFamily: ff ? 'sans-serif-medium' : undefined },
    headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2, fontFamily: ff ? 'sans-serif' : undefined },
    headerPrintBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 8,
      borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
    },
    headerPrintText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF', fontFamily: ff ? 'sans-serif-medium' : undefined },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 40 },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: c.text, fontFamily: ff ? 'sans-serif-medium' : undefined },
    emptySub: { fontSize: 14, color: c.textSub, textAlign: 'center', fontFamily: ff ? 'sans-serif' : undefined },
    scroll: { flex: 1 },
    scrollContent: { padding: 20, paddingBottom: 32 },
    courseTab: {
      paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999,
      backgroundColor: c.card, borderWidth: 1, borderColor: c.cardBorder,
    },
    courseTabText: { fontSize: 13, fontWeight: '600', color: c.text, fontFamily: ff ? 'sans-serif-medium' : undefined },
    avgCard: {
      backgroundColor: c.card, borderRadius: 20, padding: 20, marginBottom: 20,
      borderWidth: 1, borderColor: c.cardBorder,
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
      alignItems: 'center',
    },
    avgLabel: { fontSize: 13, color: c.textMuted, marginBottom: 8, fontFamily: ff ? 'sans-serif' : undefined },
    avgNum: { fontSize: 48, fontWeight: '900', color: c.text, fontFamily: ff ? 'sans-serif-black' : undefined },
    progressBg: { width: '100%', height: 8, backgroundColor: c.cardAlt, borderRadius: 999, marginTop: 12, marginBottom: 16, overflow: 'hidden' },
    progressFill: { height: '100%', backgroundColor: c.secondary, borderRadius: 999 },
    legendRow: { flexDirection: 'row', gap: 16 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
    legendText: { fontSize: 12, color: c.textSub, fontFamily: ff ? 'sans-serif' : undefined },
    sectionHeaderRow: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      marginBottom: 12, marginTop: 4,
    },
    sectionLabel: { fontSize: 16, fontWeight: '700', color: c.text, fontFamily: ff ? 'sans-serif-medium' : undefined },
    sectionPrintBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10,
    },
    sectionPrintText: { fontSize: 12, fontWeight: '700', fontFamily: ff ? 'sans-serif-medium' : undefined },
    noStudents: { backgroundColor: c.card, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: c.cardBorder, alignItems: 'center' },
    noStudentsText: { fontSize: 14, color: c.textSub, fontFamily: ff ? 'sans-serif' : undefined },
    studentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 14,
      backgroundColor: c.card,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: c.cardBorder,
    },
    studentRowFirst: {
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      borderTopWidth: 1,
    },
    studentRowLast: {
      borderBottomLeftRadius: 18,
      borderBottomRightRadius: 18,
      borderBottomWidth: 1,
      marginBottom: 20,
    },
    studentRowBorder: { borderBottomWidth: 1, borderBottomColor: c.cardBorder },
    studentInitial: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    studentInitialText: { fontSize: 16, fontWeight: '700', fontFamily: ff ? 'sans-serif-medium' : undefined },
    studentInfo: { flex: 1 },
    studentName: { fontSize: 14, fontWeight: '700', color: c.text, marginBottom: 2, fontFamily: ff ? 'sans-serif-medium' : undefined },
    studentMatric: { fontSize: 12, color: c.textMuted, fontFamily: ff ? 'sans-serif' : undefined },
    attendanceBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
    attendanceText: { fontSize: 13, fontWeight: '700', fontFamily: ff ? 'sans-serif-medium' : undefined },
  });
}
