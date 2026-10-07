import React, { useState, useMemo } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView,
  StyleSheet, Platform, Alert, Modal, FlatList, TouchableOpacity,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useUser } from '../../context/AuthContext';
import { useRouter } from 'expo-router';
import {
  User, Hash, Phone, ChevronLeft, CheckCircle,
  Building2, GraduationCap, ChevronDown, Check, Search, X, Layers,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import {
  ACADEMIC_FACULTIES,
  FACULTY_NAMES,
  ALL_DEPARTMENTS,
  getDepartmentsForFaculty,
  getFacultyForDepartment,
} from '../../constants/academicStructure';

const ff = Platform.OS === 'android';

const ACADEMIC_LEVELS = [
  { value: '100 Level', label: '100 Level', desc: '1st Year / Freshmen' },
  { value: '200 Level', label: '200 Level', desc: '2nd Year / Sophomores' },
  { value: '300 Level', label: '300 Level', desc: '3rd Year / Penultimate' },
  { value: '400 Level', label: '400 Level', desc: '4th Year / Final Year' },
  { value: '500 Level', label: '500 Level', desc: '5th Year (Engineering, Law, Tech)' },
  { value: '600 Level', label: '600 Level', desc: '6th Year (Medicine, Surgery)' },
];

export default function StudentPersonalInfoScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useUser();
  const { colors, isDark } = useTheme();

  const meta = (user?.unsafeMetadata as any) ?? {};

  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [matricNumber, setMatricNumber] = useState(meta.matric_number ?? '');
  const [level, setLevel] = useState(meta.level ?? '');
  const [department, setDepartment] = useState(meta.department ?? '');
  const [faculty, setFaculty] = useState(
    meta.faculty || getFacultyForDepartment(meta.department) || ''
  );
  const [phone, setPhone] = useState(meta.phone ?? '');
  const [saving, setSaving] = useState(false);

  const [levelModal, setLevelModal] = useState(false);
  const [facultyModal, setFacultyModal] = useState(false);
  const [deptModal, setDeptModal] = useState(false);
  const [deptSearch, setDeptSearch] = useState('');
  const [filterBySelectedFaculty, setFilterBySelectedFaculty] = useState(true);

  const PRIMARY = colors.primary;

  // Filtered departments for the department modal
  const filteredDepartments = useMemo(() => {
    let list = (filterBySelectedFaculty && faculty)
      ? getDepartmentsForFaculty(faculty)
      : ALL_DEPARTMENTS;

    if (deptSearch.trim()) {
      const q = deptSearch.toLowerCase().trim();
      list = list.filter((d) => d.toLowerCase().includes(q));
    }
    return list;
  }, [faculty, filterBySelectedFaculty, deptSearch]);

  const handleSelectFaculty = (selectedFacultyName: string) => {
    setFaculty(selectedFacultyName);
    setFacultyModal(false);

    // If currently selected department doesn't belong to the newly chosen faculty, reset it
    const availableDepts = getDepartmentsForFaculty(selectedFacultyName);
    if (department && !availableDepts.includes(department)) {
      setDepartment('');
    }
  };

  const handleSelectDepartment = (selectedDept: string) => {
    setDepartment(selectedDept);
    // Automatically synchronize parent faculty
    const parentFaculty = getFacultyForDepartment(selectedDept);
    if (parentFaculty) {
      setFaculty(parentFaculty);
    }
    setDeptModal(false);
    setDeptSearch('');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await user?.update({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        unsafeMetadata: {
          ...meta,
          matric_number: matricNumber.trim(),
          level: level.trim(),
          faculty: faculty.trim(),
          department: department.trim(),
          phone: phone.trim(),
        },
      });
      Alert.alert('Saved', 'Your information has been updated.');
      router.replace('/(student)/profile');
    } catch (e: any) {
      Alert.alert('Error', e?.errors?.[0]?.message ?? 'Failed to update. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const s = makeStyles(colors);

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={[
        s.content,
        {
          paddingTop: Math.max(insets.top, 20) + 12,
          paddingBottom: Math.max(insets.bottom, 24) + 32,
        },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <StatusBar style="light" />

      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.replace('/(student)/profile')} style={s.backBtn}>
          <ChevronLeft size={22} color="#FFFFFF" />
        </Pressable>
        <Text style={s.headerTitle}>Personal Info</Text>
        <Pressable onPress={handleSave} disabled={saving} style={s.saveBtn}>
          <CheckCircle size={20} color="#FFFFFF" />
        </Pressable>
      </View>

      {/* Avatar row */}
      <View style={s.avatarRow}>
        <View style={s.avatarCircle}>
          <Text style={s.avatarInitial}>
            {(firstName || user?.firstName || 'S').charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.avatarName} numberOfLines={1}>
            {firstName || user?.firstName} {lastName || user?.lastName}
          </Text>
          <Text style={s.avatarSub}>Student • Redeemer's University</Text>
        </View>
      </View>

      {/* Basic Details */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>Basic Details</Text>

        <View style={s.field}>
          <View style={s.fieldIcon}><User size={18} color={PRIMARY} /></View>
          <View style={s.fieldBody}>
            <Text style={s.fieldLabel}>First Name</Text>
            <TextInput
              style={s.fieldInput}
              value={firstName}
              placeholder="Enter first name"
              placeholderTextColor={colors.textMuted}
              onChangeText={setFirstName}
            />
          </View>
        </View>

        <View style={[s.field, s.fieldBorder]}>
          <View style={s.fieldIcon}><User size={18} color={PRIMARY} /></View>
          <View style={s.fieldBody}>
            <Text style={s.fieldLabel}>Last Name</Text>
            <TextInput
              style={s.fieldInput}
              value={lastName}
              placeholder="Enter last name"
              placeholderTextColor={colors.textMuted}
              onChangeText={setLastName}
            />
          </View>
        </View>
      </View>

      {/* Academic Info */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>Academic Info</Text>

        {/* Matric Number */}
        <View style={s.field}>
          <View style={s.fieldIcon}><Hash size={18} color={PRIMARY} /></View>
          <View style={s.fieldBody}>
            <Text style={s.fieldLabel}>Matric Number</Text>
            <TextInput
              style={s.fieldInput}
              value={matricNumber}
              placeholder="e.g. 19/1234"
              placeholderTextColor={colors.textMuted}
              onChangeText={setMatricNumber}
              autoCapitalize="characters"
            />
          </View>
        </View>

        {/* Academic Level */}
        <View style={[s.field, s.fieldBorder]}>
          <View style={s.fieldIcon}><Layers size={18} color={PRIMARY} /></View>
          <Pressable style={s.fieldBody} onPress={() => setLevelModal(true)}>
            <Text style={s.fieldLabel}>Level / Academic Standing</Text>
            <View style={s.pickerRow}>
              <Text
                style={[s.fieldInput, !level && { color: colors.textMuted }]}
                numberOfLines={1}
              >
                {level || 'Select level (e.g. 100 Level)'}
              </Text>
              <ChevronDown size={16} color={colors.textMuted} />
            </View>
          </Pressable>
        </View>

        {/* Faculty */}
        <View style={[s.field, s.fieldBorder]}>
          <View style={s.fieldIcon}><GraduationCap size={18} color={PRIMARY} /></View>
          <Pressable style={s.fieldBody} onPress={() => setFacultyModal(true)}>
            <Text style={s.fieldLabel}>Faculty (10 RUN Faculties)</Text>
            <View style={s.pickerRow}>
              <Text
                style={[s.fieldInput, !faculty && { color: colors.textMuted }]}
                numberOfLines={1}
              >
                {faculty || 'Select faculty'}
              </Text>
              <ChevronDown size={16} color={colors.textMuted} />
            </View>
          </Pressable>
        </View>

        {/* Department */}
        <View style={[s.field, s.fieldBorder]}>
          <View style={s.fieldIcon}><Building2 size={18} color={PRIMARY} /></View>
          <Pressable
            style={s.fieldBody}
            onPress={() => {
              setDeptSearch('');
              setDeptModal(true);
            }}
          >
            <Text style={s.fieldLabel}>Department</Text>
            <View style={s.pickerRow}>
              <Text
                style={[s.fieldInput, !department && { color: colors.textMuted }]}
                numberOfLines={1}
              >
                {department || 'Select department'}
              </Text>
              <ChevronDown size={16} color={colors.textMuted} />
            </View>
          </Pressable>
        </View>
      </View>

      {/* Level Modal */}
      <Modal visible={levelModal} transparent animationType="slide" onRequestClose={() => setLevelModal(false)}>
        <Pressable style={s.modalBackdrop} onPress={() => setLevelModal(false)} />
        <View style={[s.modalSheet, { backgroundColor: colors.card }]}>
          <View style={s.modalHeader}>
            <View>
              <Text style={[s.modalTitle, { color: colors.text }]}>Select Level</Text>
              <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
                100L – 600L Undergraduate
              </Text>
            </View>
            <Pressable onPress={() => setLevelModal(false)} style={s.modalClose}>
              <Text style={{ color: PRIMARY, fontWeight: '700', fontSize: 15 }}>Done</Text>
            </Pressable>
          </View>
          <FlatList
            data={ACADEMIC_LEVELS}
            keyExtractor={(item) => item.value}
            renderItem={({ item }) => {
              const isSelected = item.value === level;
              return (
                <TouchableOpacity
                  style={[
                    s.deptItem,
                    { borderBottomColor: colors.cardBorder },
                    isSelected && { backgroundColor: colors.primaryDim },
                  ]}
                  onPress={() => {
                    setLevel(item.value);
                    setLevelModal(false);
                  }}
                >
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={[s.deptItemText, { color: isSelected ? PRIMARY : colors.text, fontWeight: '600' }]}>
                      {item.label}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
                      {item.desc}
                    </Text>
                  </View>
                  {isSelected && <Check size={18} color={PRIMARY} />}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </Modal>

      {/* Faculty Modal */}
      <Modal visible={facultyModal} transparent animationType="slide" onRequestClose={() => setFacultyModal(false)}>
        <Pressable style={s.modalBackdrop} onPress={() => setFacultyModal(false)} />
        <View style={[s.modalSheet, { backgroundColor: colors.card }]}>
          <View style={s.modalHeader}>
            <View>
              <Text style={[s.modalTitle, { color: colors.text }]}>Select Faculty</Text>
              <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
                10 Faculties • Redeemer's University
              </Text>
            </View>
            <Pressable onPress={() => setFacultyModal(false)} style={s.modalClose}>
              <Text style={{ color: PRIMARY, fontWeight: '700', fontSize: 15 }}>Done</Text>
            </Pressable>
          </View>
          <FlatList
            data={ACADEMIC_FACULTIES}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const isSelected = item.name === faculty;
              return (
                <TouchableOpacity
                  style={[
                    s.deptItem,
                    { borderBottomColor: colors.cardBorder },
                    isSelected && { backgroundColor: colors.primaryDim },
                  ]}
                  onPress={() => handleSelectFaculty(item.name)}
                >
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                      <Text style={[s.deptItemText, { color: isSelected ? PRIMARY : colors.text, fontWeight: '600', flex: 1 }]}>
                        {item.name}
                      </Text>
                      <View style={[s.codeBadge, { backgroundColor: colors.cardAlt }]}>
                        <Text style={[s.codeBadgeText, { color: colors.textMuted }]}>{item.shortName}</Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: 12, color: colors.textMuted }}>
                      {item.departments.length} Departments
                    </Text>
                  </View>
                  {isSelected && <Check size={18} color={PRIMARY} />}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </Modal>

      {/* Department Modal */}
      <Modal visible={deptModal} transparent animationType="slide" onRequestClose={() => setDeptModal(false)}>
        <Pressable style={s.modalBackdrop} onPress={() => setDeptModal(false)} />
        <View style={[s.modalSheet, { backgroundColor: colors.card, maxHeight: '80%' }]}>
          <View style={s.modalHeader}>
            <View>
              <Text style={[s.modalTitle, { color: colors.text }]}>Select Department</Text>
              <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
                {faculty ? `Filter: ${faculty}` : 'All 56 Departments'}
              </Text>
            </View>
            <Pressable onPress={() => setDeptModal(false)} style={s.modalClose}>
              <Text style={{ color: PRIMARY, fontWeight: '700', fontSize: 15 }}>Done</Text>
            </Pressable>
          </View>

          {/* Search Box */}
          <View style={[s.searchBar, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}>
            <Search size={16} color={colors.textMuted} style={{ marginRight: 8 }} />
            <TextInput
              style={[s.searchInput, { color: colors.text }]}
              value={deptSearch}
              onChangeText={setDeptSearch}
              placeholder="Search departments..."
              placeholderTextColor={colors.textMuted}
              autoCorrect={false}
            />
            {deptSearch ? (
              <Pressable onPress={() => setDeptSearch('')}>
                <X size={16} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>

          {/* Faculty Filter Toggle */}
          {faculty ? (
            <View style={s.filterToggleRow}>
              <Pressable
                onPress={() => setFilterBySelectedFaculty(true)}
                style={[
                  s.toggleChip,
                  filterBySelectedFaculty && { backgroundColor: PRIMARY, borderColor: PRIMARY },
                ]}
              >
                <Text
                  style={[
                    s.toggleChipText,
                    { color: filterBySelectedFaculty ? '#FFFFFF' : colors.textMuted },
                  ]}
                  numberOfLines={1}
                >
                  My Faculty ({getDepartmentsForFaculty(faculty).length})
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setFilterBySelectedFaculty(false)}
                style={[
                  s.toggleChip,
                  !filterBySelectedFaculty && { backgroundColor: PRIMARY, borderColor: PRIMARY },
                ]}
              >
                <Text
                  style={[
                    s.toggleChipText,
                    { color: !filterBySelectedFaculty ? '#FFFFFF' : colors.textMuted },
                  ]}
                >
                  All RUN Depts ({ALL_DEPARTMENTS.length})
                </Text>
              </Pressable>
            </View>
          ) : null}

          {/* Department List */}
          <FlatList
            data={filteredDepartments}
            keyExtractor={(item) => item}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={{ padding: 32, alignItems: 'center' }}>
                <Text style={{ color: colors.textMuted, fontSize: 14 }}>
                  No matching departments found.
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const isSelected = item === department;
              const parentFaculty = getFacultyForDepartment(item);
              return (
                <TouchableOpacity
                  style={[
                    s.deptItem,
                    { borderBottomColor: colors.cardBorder },
                    isSelected && { backgroundColor: colors.primaryDim },
                  ]}
                  onPress={() => handleSelectDepartment(item)}
                >
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={[s.deptItemText, { color: isSelected ? PRIMARY : colors.text, fontWeight: isSelected ? '700' : '500' }]}>
                      {item}
                    </Text>
                    {parentFaculty && (
                      <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>
                        {parentFaculty}
                      </Text>
                    )}
                  </View>
                  {isSelected && <Check size={18} color={PRIMARY} />}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </Modal>

      {/* Contact Section */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>Contact</Text>

        <View style={s.field}>
          <View style={s.fieldIcon}><Phone size={18} color={PRIMARY} /></View>
          <View style={s.fieldBody}>
            <Text style={s.fieldLabel}>Phone Number</Text>
            <TextInput
              style={s.fieldInput}
              value={phone}
              placeholder="e.g. 08012345678"
              placeholderTextColor={colors.textMuted}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
          </View>
        </View>
      </View>

      {/* Read-only email */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>Account</Text>
        <View style={[s.field, s.readonlyField]}>
          <View style={s.fieldBody}>
            <Text style={s.fieldLabel}>Email Address</Text>
            <Text style={s.readonlyValue}>
              {user?.primaryEmailAddress?.emailAddress ?? '—'}
            </Text>
          </View>
          <View style={s.lockedBadge}>
            <Text style={s.lockedText}>Verified</Text>
          </View>
        </View>
      </View>

      {/* Save button */}
      <Pressable
        onPress={handleSave}
        disabled={saving}
        style={[s.saveMainBtn, saving && { opacity: 0.6 }]}
      >
        <Text style={s.saveMainBtnText}>{saving ? 'Saving...' : 'Save Changes'}</Text>
      </Pressable>
    </ScrollView>
  );
}

function makeStyles(c: ReturnType<typeof import('../../context/ThemeContext').useTheme>['colors']) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    content: { paddingBottom: 48 },
    header: {
      backgroundColor: c.primary,
      paddingHorizontal: 20,
      paddingBottom: 20,
      borderBottomLeftRadius: 28,
      borderBottomRightRadius: 28,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    headerTitle: { fontSize: 20, fontWeight: '700', color: '#FFFFFF', fontFamily: ff ? 'sans-serif-medium' : undefined },
    backBtn: { width: 38, height: 38, backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
    saveBtn: { width: 38, height: 38, backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
    avatarRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 20 },
    avatarCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
    avatarInitial: { fontSize: 24, fontWeight: '700', color: '#FFFFFF', fontFamily: ff ? 'sans-serif-medium' : undefined },
    avatarName: { fontSize: 18, fontWeight: '700', color: c.text, fontFamily: ff ? 'sans-serif-medium' : undefined },
    avatarSub: { fontSize: 13, color: c.textMuted, marginTop: 2, fontFamily: ff ? 'sans-serif' : undefined },
    section: {
      backgroundColor: c.card, marginHorizontal: 20, marginBottom: 12,
      borderRadius: 18, borderWidth: 1, borderColor: c.cardBorder,
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
      overflow: 'hidden',
    },
    sectionTitle: {
      fontSize: 12, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase',
      letterSpacing: 0.8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4,
      fontFamily: ff ? 'sans-serif-medium' : undefined,
    },
    field: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
    fieldBorder: { borderTopWidth: 1, borderTopColor: c.cardBorder },
    fieldIcon: { width: 36, height: 36, backgroundColor: c.primaryDim, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    fieldBody: { flex: 1 },
    fieldLabel: { fontSize: 11, fontWeight: '600', color: c.textMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: ff ? 'sans-serif-medium' : undefined },
    fieldInput: { fontSize: 15, color: c.text, fontFamily: ff ? 'sans-serif' : undefined, paddingVertical: 0 },
    pickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
    modalSheet: { maxHeight: '70%', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 32 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: c.cardBorder },
    modalTitle: { fontSize: 17, fontWeight: '700', fontFamily: ff ? 'sans-serif-medium' : undefined },
    modalClose: { padding: 4 },
    searchBar: {
      flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 12, marginBottom: 8,
      paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1,
    },
    searchInput: { flex: 1, fontSize: 14, padding: 0 },
    filterToggleRow: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 8, gap: 8 },
    toggleChip: {
      paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
      borderWidth: 1, borderColor: c.cardBorder, backgroundColor: c.cardAlt,
    },
    toggleChipText: { fontSize: 12, fontWeight: '600' },
    deptItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
    deptItemText: { fontSize: 15, fontFamily: ff ? 'sans-serif' : undefined },
    codeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginLeft: 8 },
    codeBadgeText: { fontSize: 10, fontWeight: '700' },
    readonlyField: { backgroundColor: c.cardAlt },
    readonlyValue: { fontSize: 15, color: c.text, fontFamily: ff ? 'sans-serif' : undefined },
    lockedBadge: { backgroundColor: c.primaryDim, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
    lockedText: { fontSize: 12, fontWeight: '600', color: c.primaryText, fontFamily: ff ? 'sans-serif-medium' : undefined },
    saveMainBtn: {
      backgroundColor: c.primary, marginHorizontal: 20, borderRadius: 999,
      paddingVertical: 16, alignItems: 'center', elevation: 2, marginTop: 8,
    },
    saveMainBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 17, fontFamily: ff ? 'sans-serif-medium' : undefined },
  });
}
