import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, SafeAreaView, Alert, TextInput } from 'react-native';
import Modal from 'react-native-modal';
import { supabase } from '../lib/supabase';

export default function ClassListScreen({ navigation }) {
  const [lectures, setLectures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  
  // State for password modal
  const [isModalVisible, setModalVisible] = useState(false);
  const [password, setPassword] = useState('');
  const [selectedLecture, setSelectedLecture] = useState(null);

  // This hook runs when the screen is focused
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchUserDataAndLectures();
    });
    return unsubscribe;
  }, [navigation]);

  async function fetchUserDataAndLectures() {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigation.replace('Login');
        return;
      }
      setUser(user);

      const today = new Date().getDay();
      const { data, error } = await supabase
        .from('schedules')
        .select(`
          id, start_time, end_time, is_extra_class, day_of_week,
          courses (name, course_code),
          schedule_groups ( student_groups (id, group_name) )
        `)
        .eq('teacher_profile_id', user.id)
        .order('start_time');

      if (error) throw error;
      
      // Filter in JS to handle today's regular classes + all extra classes
      const filteredData = data.filter(lec => lec.day_of_week === today || lec.is_extra_class);
      
      // --- NEW LOGIC: Check which classes are already submitted ---
      if (filteredData.length > 0) {
        const scheduleIds = filteredData.map(s => s.id);
        const todayStr = new Date().toISOString().split('T')[0];

        const { data: attendanceData } = await supabase
          .from('attendance')
          .select('schedule_id')
          .in('schedule_id', scheduleIds)
          .eq('date', todayStr);
        
        const submittedScheduleIds = new Set(attendanceData.map(a => a.schedule_id));

        // Add 'isSubmitted' property to each lecture
        const lecturesWithStatus = filteredData.map(lecture => ({
          ...lecture,
          isSubmitted: submittedScheduleIds.has(lecture.id)
        }));
        setLectures(lecturesWithStatus || []);
      } else {
        setLectures([]);
      }
      // --- END OF NEW LOGIC ---

    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigation.replace('Login');
  };

  // --- Manual Edit Password Logic (Request #2) ---
  const onManualEditPress = (lecture) => {
    setSelectedLecture(lecture);
    setModalVisible(true);
  };

  const handlePasswordConfirm = async () => {
    if (!password || !user?.email) {
      Alert.alert('Error', 'Password cannot be empty');
      return;
    }

    // Re-authenticate user
    const { error } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: password,
    });

    if (error) {
      Alert.alert('Access Denied', 'Incorrect password.');
    } else {
      // Success! Navigate to Manual Edit screen
      setModalVisible(false);
      setPassword('');
      navigation.navigate('ManualEdit', { lecture: selectedLecture });
    }
  };
  // ----------------------------------------------

  const renderLectureItem = ({ item }) => (
    <View style={styles.card}>
      <Text style={styles.cardExtra}>{item.is_extra_class ? '[EXTRA CLASS]' : ''}</Text>
      <Text style={styles.courseName}>{item.courses.name} ({item.courses.course_code})</Text>
      <Text style={styles.courseTime}>{item.start_time.slice(0,5)} - {item.end_time.slice(0,5)}</Text>
      <Text style={styles.groups}>
        Groups: {item.schedule_groups.map(sg => sg.student_groups.group_name).join(', ')}
      </Text>

      {/* --- MODIFIED LOGIC FOR BUTTONS --- */}
      <View style={styles.buttonRow}>
        <TouchableOpacity 
          style={[styles.actionButton, styles.cameraButton]} 
          onPress={() => navigation.navigate('Camera', { lecture: item })}
        >
          {/* Change text based on submission status */}
          <Text style={styles.actionButtonText}>
            {item.isSubmitted ? 'Re-scan with Camera' : 'Start Camera'}
          </Text>
        </TouchableOpacity>
        
        {/* Conditionally render the Manual Edit button */}
        {item.isSubmitted && (
          <TouchableOpacity 
            style={[styles.actionButton, styles.manualButton]}
            onPress={() => onManualEditPress(item)}
          >
            <Text style={styles.actionButtonText}>Manual Edit</Text>
          </TouchableOpacity>
        )}
      </View>
      {/* --- END OF MODIFIED LOGIC --- */}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>Today's Classes</Text>
        <TouchableOpacity onPress={handleLogout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>
      
      <FlatList
        data={lectures}
        renderItem={renderLectureItem}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={<Text style={styles.emptyText}>{loading ? "Loading..." : "No classes today."}</Text>}
        refreshing={loading}
        onRefresh={fetchUserDataAndLectures}
      />

      {/* --- Add Extra Class Button (Request #1) --- */}
      <TouchableOpacity 
        style={styles.fab} 
        onPress={() => navigation.navigate('ExtraClass')}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {/* --- Password Modal (Request #2) --- */}
      <Modal isVisible={isModalVisible} onBackdropPress={() => setModalVisible(false)}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Password Required</Text>
          <Text style={styles.modalSubtitle}>Please enter your password to manually edit attendance.</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your password"
            placeholderTextColor="#9ca3af"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          <TouchableOpacity style={styles.modalButton} onPress={handlePasswordConfirm}>
            <Text style={styles.actionButtonText}>Confirm</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  header: { fontSize: 28, fontWeight: 'bold', color: '#1e293b' },
  logoutText: { fontSize: 16, color: '#ef4444', fontWeight: '500' },
  listContainer: { paddingHorizontal: 20, paddingBottom: 100 },
  card: { 
    backgroundColor: 'white', padding: 20, borderRadius: 16, marginBottom: 16,
    shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 10, elevation: 3 
  },
  cardExtra: { color: '#005CAB', fontWeight: 'bold', fontSize: 12, marginBottom: 4 },
  courseName: { fontSize: 18, fontWeight: 'bold', color: '#334155' },
  courseTime: { fontSize: 14, color: '#64748b', marginTop: 4 },
  groups: { fontSize: 14, color: '#64748b', marginTop: 4, fontStyle: 'italic' },
  emptyText: { textAlign: 'center', marginTop: 50, color: '#94a3b8', fontSize: 16 },
  buttonRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20, gap: 10 },
  actionButton: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  actionButtonText: { color: 'white', fontSize: 14, fontWeight: 'bold' },
  cameraButton: { backgroundColor: '#005CAB' }, // Using your logo color
  manualButton: { backgroundColor: '#f59e0b' },
  fab: {
    position: 'absolute', bottom: 30, right: 20, width: 60, height: 60,
    backgroundColor: '#10b981', borderRadius: 30,
    alignItems: 'center', justifyContent: 'center',
    elevation: 8, shadowColor: '#000', shadowRadius: 5, shadowOpacity: 0.3
  },
  fabText: { color: 'white', fontSize: 32, lineHeight: 32, fontWeight: 'bold' },
  modalContent: { backgroundColor: 'white', padding: 22, borderRadius: 16 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 12 },
  modalSubtitle: { fontSize: 14, color: '#64748b', marginBottom: 20 },
  input: { 
    backgroundColor: '#f1f5f9', padding: 15, borderRadius: 10, 
    marginBottom: 20, fontSize: 16, color: '#111827' 
  },
  modalButton: { backgroundColor: '#005CAB', padding: 15, borderRadius: 10, alignItems: 'center' },
});