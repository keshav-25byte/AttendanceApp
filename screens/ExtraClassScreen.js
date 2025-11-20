import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Alert, ActivityIndicator, TextInput } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { supabase } from '../lib/supabase';

export default function ExtraClassScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [user, setUser] = useState(null);
  const [courses, setCourses] = useState([]);
  const [groups, setGroups] = useState([]);
  
  // Form State
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedGroups, setSelectedGroups] = useState([]);
  const [startTime, setStartTime] = useState(new Date().toTimeString().slice(0,5));

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigation.replace('Login');
        return;
      }
      setUser(user);

      // Fetch teacher's courses and all groups in college
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('college_id')
        .eq('id', user.id)
        .single();
      
      if (profileError) throw profileError;
      const collegeId = profile.college_id;
      
      const { data: courseData, error: courseError } = await supabase
        .from('courses')
        .select('id, name, course_code')
        .eq('college_id', collegeId)
        .order('name');
      if (courseError) throw courseError;
      setCourses(courseData);

      const { data: groupData, error: groupError } = await supabase
        .from('student_groups')
        .select('id, group_name')
        .eq('college_id', collegeId)
        .order('group_name');
      if (groupError) throw groupError;
      setGroups(groupData);

    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  }

  const toggleGroupSelection = (groupId) => {
    setSelectedGroups(prev => 
      prev.includes(groupId) 
        ? prev.filter(id => id !== groupId) 
        : [...prev, groupId]
    );
  };

  const handleSubmit = async () => {
    if (!selectedCourse || selectedGroups.length === 0) {
      Alert.alert('Missing Info', 'Please select a course and at least one group.');
      return;
    }

    try {
      setSubmitting(true);
      
      // 1. Create the schedule
      const { data: newSchedule, error: scheduleError } = await supabase
        .from('schedules')
        .insert({
          college_id: courses.find(c => c.id === selectedCourse)?.college_id, // Get college_id from course
          course_id: selectedCourse,
          teacher_profile_id: user.id,
          day_of_week: new Date().getDay(), // Set to today
          start_time: startTime,
          end_time: startTime, // Start and end time are same for extra class
          is_extra_class: true
        })
        .select('id')
        .single();
      
      if (scheduleError) throw scheduleError;

      // 2. Link the groups
      const scheduleGroupLinks = selectedGroups.map(gid => ({
        schedule_id: newSchedule.id,
        group_id: gid
      }));
      
      const { error: linkError } = await supabase
        .from('schedule_groups')
        .insert(scheduleGroupLinks);

      if (linkError) throw linkError;

      Alert.alert('Success', 'Extra class created. You will now find it on your class list.');
      navigation.goBack();

    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setSubmitting(false);
    }
  };


  if (loading) {
    return <ActivityIndicator size="large" style={{ flex: 1, justifyContent: 'center' }} />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>{"<"} Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.header}>Add Extra Class</Text>
        <View style={{width: 50}} />
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>Select Course</Text>
        <View style={styles.pickerWrapper}>
          <Picker
            selectedValue={selectedCourse}
            onValueChange={(itemValue) => setSelectedCourse(itemValue)}
            style={styles.picker}
            dropdownIconColor="#334155"
            mode="dropdown"
          >
            <Picker.Item label="Select a course..." value={null} color="#9ca3af" />
            {courses.map(course => (
              <Picker.Item key={course.id} label={`${course.name} (${course.course_code})`} value={course.id} color="#1e293b" />

            ))}
          </Picker>
        </View>
        {selectedCourse && (
    <Text style={styles.helperText}>
        Selected: {courses.find(c => c.id === selectedCourse)?.name}
    </Text>
)}

        <Text style={styles.label}>Start Time (HH:MM)</Text>
        <TextInput
            style={styles.input}
            value={startTime}
            onChangeText={setStartTime}
          />

        <Text style={styles.label}>Select Groups (Tap to toggle)</Text>
        <View style={styles.groupContainer}>
          {groups.map(group => (
            <TouchableOpacity 
              key={group.id}
              style={[
                styles.groupChip, 
                selectedGroups.includes(group.id) && styles.groupChipSelected
              ]}
              onPress={() => toggleGroupSelection(group.id)}
            >
              <Text style={selectedGroups.includes(group.id) ? styles.groupTextSelected : styles.groupText}>
                {group.group_name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.footer}>
         <TouchableOpacity 
          style={[styles.button, submitting && styles.disabledBtn]} 
          onPress={handleSubmit}
          disabled={submitting}
         >
           <Text style={styles.btnText}>{submitting ? "Creating..." : "Create Class"}</Text>
         </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  header: { fontSize: 22, fontWeight: 'bold', color: '#1e293b' },
  backText: { fontSize: 16, color: '#005CAB', fontWeight: '500' },
  
  form: { flex: 1, padding: 20 },
  label: { fontSize: 16, fontWeight: '500', color: '#334155', marginBottom: 10, marginTop: 15 },
  
  // --- NEW PICKER STYLES ---
  pickerWrapper: { 
      backgroundColor: 'white', 
      borderRadius: 10, 
      borderWidth: 1, 
      borderColor: '#cbd5e1', 
      overflow: 'hidden' 
  },
  picker: { 
      height: 55, 
      width: '100%', 
      backgroundColor: 'white',
      color: '#1e293b' 
  },
  helperText: {
      fontSize: 12,
      color: '#005CAB',
      marginTop: 5,
      marginLeft: 5,
      fontWeight: '600'
  },
  // -------------------------

  input: { 
    backgroundColor: 'white', padding: 15, borderRadius: 10, 
    fontSize: 16, color: '#111827', borderWidth: 1, borderColor: '#cbd5e1'
  },
  
  // --- IMPROVED GROUP CHIPS ---
  groupContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 40 }, 
  groupChip: {
    paddingVertical: 10, paddingHorizontal: 15,
    backgroundColor: 'white', borderRadius: 20,
    borderWidth: 1, borderColor: '#cbd5e1'
  },
  groupChipSelected: { backgroundColor: '#005CAB', borderColor: '#005CAB' },
  groupText: { color: '#334155', fontWeight: '500' },
  groupTextSelected: { color: 'white', fontWeight: '500' },
  // ----------------------------

  footer: { padding: 20, backgroundColor: 'white', borderTopWidth: 1, borderColor: '#e2e8f0' },
  button: { padding: 16, borderRadius: 12, alignItems: 'center', backgroundColor: '#10b981' },
  disabledBtn: { backgroundColor: '#cbd5e1' },
  btnText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
});