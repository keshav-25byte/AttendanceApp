import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, SafeAreaView, Alert, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabase';

/**
 * Screen for manually marking or correcting attendance.
 * Fetches all students belonging to the groups in the lecture,
 * merges them with any existing attendance data for today,
 * and allows toggling status (Present, Late, Absent).
 */
export default function ManualEditScreen({ route, navigation }) {
  const { lecture } = route.params;
  const [students, setStudents] = useState([]); // Array of { student, status } objects
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchStudents();
  }, []);

  async function fetchStudents() {
    try {
      setLoading(true);
      const groupIds = lecture.schedule_groups.map(sg => sg.student_groups.id);

      // 1. Get all students that belong to the groups in this lecture
      const { data: studentsData, error: studentError } = await supabase
        .from('student_group_members')
        .select('students (*)')
        .in('group_id', groupIds);

      if (studentError) throw studentError;

      // 2. De-duplicate students (one student might be in multiple groups)
      const uniqueStudents = Array.from(new Map(studentsData.map(item => [item.students.id, item.students])).values());

      // 3. Get existing attendance records for these students for today
      const today = new Date().toISOString().split('T')[0];
      const { data: attendanceData, error: attendanceError } = await supabase
        .from('attendance')
        .select('student_id, status')
        .eq('date', today)
        .in('student_id', uniqueStudents.map(s => s.id));
      
      if (attendanceError) throw attendanceError;

      // 4. Create a map for quick lookup of existing status
      const attendanceMap = new Map(attendanceData.map(a => [a.student_id, a.status]));

      // 5. Merge student data with their status (default to 'absent' if no record)
      const studentList = uniqueStudents.map(student => ({
        student,
        status: attendanceMap.get(student.id) || 'absent' 
      })).sort((a, b) => a.student.name.localeCompare(b.student.name));
      
      setStudents(studentList);

    } catch (error) {
      Alert.alert('Error fetching students', error.message);
    } finally {
      setLoading(false);
    }
  }

  const setStudentStatus = (studentId, status) => {
    setStudents(prevStudents => 
      prevStudents.map(item => 
        item.student.id === studentId ? { ...item, status } : item
      )
    );
  };

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      const today = new Date().toISOString().split('T')[0];
      
      const recordsToUpsert = students.map(item => ({
        student_id: item.student.id,
        date: today,
        status: item.status,
        schedule_id: lecture.id,
        marked_at: new Date().toISOString(),
      }));

      // Upsert: Updates if record exists (based on Conflict), inserts if not.
      const { error } = await supabase
        .from('attendance')
        .upsert(recordsToUpsert, { onConflict: 'student_id, date, schedule_id' }); 

      if (error) throw error;

      Alert.alert('Success', 'Attendance has been submitted successfully.');
      navigation.goBack();

    } catch (error) {
      Alert.alert('Error Submitting', error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const renderStudentItem = ({ item }) => (
    <View style={styles.studentRow}>
      <View style={styles.studentInfo}>
        <Text style={styles.studentName}>{item.student.name}</Text>
        <Text style={styles.studentRoll}>Roll: {item.student.roll_number}</Text>
      </View>
      <View style={styles.statusButtons}>
        <TouchableOpacity 
          style={[styles.statusBtn, item.status === 'present' && styles.presentBtn]}
          onPress={() => setStudentStatus(item.student.id, 'present')}
        >
          <Text style={[styles.statusBtnText, item.status === 'present' && styles.presentBtnText]}>P</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.statusBtn, item.status === 'late' && styles.lateBtn]}
          onPress={() => setStudentStatus(item.student.id, 'late')}
        >
          <Text style={[styles.statusBtnText, item.status === 'late' && styles.lateBtnText]}>L</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.statusBtn, item.status === 'absent' && styles.absentBtn]}
          onPress={() => setStudentStatus(item.student.id, 'absent')}
        >
          <Text style={[styles.statusBtnText, item.status === 'absent' && styles.absentBtnText]}>A</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>{"<"} Back</Text>
        </TouchableOpacity>
        <Text style={styles.header}>Manual Edit</Text>
        <View style={{width: 50}} />
      </View>
      <Text style={styles.subHeader}>{lecture.courses.name}</Text>
      
      {loading ? (
        <ActivityIndicator size="large" style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          data={students}
          renderItem={renderStudentItem}
          keyExtractor={(item) => item.student.id.toString()}
          contentContainerStyle={styles.listContainer}
        />
      )}

      <View style={styles.footer}>
         <TouchableOpacity 
          style={[styles.button, submitting && styles.disabledBtn]} 
          onPress={handleSubmit}
          disabled={submitting}
         >
           <Text style={styles.btnText}>{submitting ? "Submitting..." : "Submit Attendance"}</Text>
         </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  header: { fontSize: 22, fontWeight: 'bold', color: '#1e293b' },
  backText: { fontSize: 16, color: '#4f46e5', fontWeight: '500' },
  subHeader: { fontSize: 16, color: '#64748b', textAlign: 'center', paddingHorizontal: 20, marginTop: -15, marginBottom: 10 },
  listContainer: { paddingHorizontal: 20 },
  studentRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 1, borderColor: '#f1f5f9',
    backgroundColor: 'white', paddingHorizontal: 15, borderRadius: 10, marginBottom: 8
  },
  studentInfo: { flex: 1, marginRight: 10 },
  studentName: { fontSize: 16, color: '#1e293b', fontWeight: '500' },
  studentRoll: { fontSize: 14, color: '#64748b' },
  statusButtons: { flexDirection: 'row', gap: 5 },
  statusBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#f1f5f9', borderWidth: 2, borderColor: 'transparent'
  },
  statusBtnText: { fontSize: 14, fontWeight: 'bold', color: '#64748b' },
  presentBtn: { backgroundColor: '#dcfce7', borderColor: '#22c55e' },
  presentBtnText: { color: '#166534' },
  lateBtn: { backgroundColor: '#fef3c7', borderColor: '#f59e0b' },
  lateBtnText: { color: '#854d0e' },
  absentBtn: { backgroundColor: '#fee2e2', borderColor: '#ef4444' },
  absentBtnText: { color: '#991b1b' },
  footer: { padding: 20, backgroundColor: 'white', borderTopWidth: 1, borderColor: '#e2e8f0' },
  button: { padding: 16, borderRadius: 12, alignItems: 'center', backgroundColor: '#10b981' },
  disabledBtn: { backgroundColor: '#cbd5e1' },
  btnText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
});