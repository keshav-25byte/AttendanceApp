import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, FlatList, SafeAreaView } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import * as FileSystem from 'expo-file-system'; // Needed to read the photo file
import { supabase } from '../lib/supabase';

// REPLACE WITH YOUR ACTUAL PUBLIC IP
const FACE_API_WS_URL = 'https://ca.avinya.live'; 

export default function DashboardScreen({ navigation }) {
  const { hasPermission, requestPermission } = useCameraPermission();
  const [isScanning, setIsScanning] = useState(false);
  const [status, setStatus] = useState('Idle');
  
  // Camera State
  const [facing, setFacing] = useState('front');
  const device = useCameraDevice(facing);
  const camera = useRef(null);

  // Data State
  const [lectures, setLectures] = useState([]);
  const [selectedLecture, setSelectedLecture] = useState(null);
  const [loading, setLoading] = useState(true);

  const ws = useRef(null);

  useEffect(() => {
    requestPermission();
    fetchLectures();
    return () => stopScanning();
  }, []);

  function toggleCameraFacing() {
    setFacing(current => (current === 'back' ? 'front' : 'back'));
  }

  async function fetchLectures() {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const today = new Date().getDay(); 

      const { data, error } = await supabase
        .from('schedules')
        .select(`
          id, start_time, end_time,
          courses (name, course_code),
          schedule_groups ( student_groups (id, group_name) )
        `)
        .eq('teacher_profile_id', user.id)
        .eq('day_of_week', today)
        .order('start_time');

      if (error) throw error;
      setLectures(data || []);
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  }

  const startScanning = async () => {
    if (!selectedLecture) return Alert.alert('Select a class first');
    if (!hasPermission) {
        const granted = await requestPermission();
        if (!granted) return Alert.alert("Camera permission denied");
    }

    const groupIds = selectedLecture.schedule_groups.map(sg => sg.student_groups.id);
    if (groupIds.length === 0) return Alert.alert("Error", "No student groups found.");

    setIsScanning(true);
    setStatus('Connecting...');

    ws.current = new WebSocket(`${FACE_API_WS_URL}/ws/start_attendance`);

    ws.current.onopen = () => {
      setStatus('Connected. Sending Config...');
      ws.current.send(JSON.stringify({ group_ids: groupIds }));
    };

    ws.current.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === 'status' && data.message === 'ready') {
        setStatus(`Scanning: ${selectedLecture.courses.name}...`);
        captureLoop();
      }
    };

    ws.current.onerror = (e) => {
      console.log("WS Error:", e.message);
      setStatus('Connection Error');
      setIsScanning(false);
    };
  };

  const stopScanning = () => {
    setIsScanning(false);
    setStatus('Idle');
    if (ws.current) ws.current.close();
  };

  const captureLoop = async () => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN || !isScanning) return;

    if (camera.current && device) {
      try {
        // 1. Take Photo SILENTLY
        const photo = await camera.current.takePhoto({
          enableShutterSound: false, // <--- THIS REMOVES THE SOUND
          qualityPrioritization: 'speed', // Take it fast
          flash: 'off'
        });

        // 2. Read the file from disk as Base64
        const base64 = await FileSystem.readAsStringAsync(photo.path, {
            encoding: FileSystem.EncodingType.Base64,
        });

        // 3. Send to Python
        ws.current.send(`data:image/jpeg;base64,${base64}`);

        // 4. Delete the temp file to save space
        await FileSystem.deleteAsync(photo.path, { idempotent: true });

      } catch (err) {
        console.log("Capture error:", err);
      }
    }

    // Loop roughly every 600ms
    setTimeout(() => {
        if (isScanning) captureLoop();
    }, 600);
  };

  const renderLectureItem = ({ item }) => (
    <TouchableOpacity 
      style={[styles.card, selectedLecture?.id === item.id && styles.selectedCard]} 
      onPress={() => setSelectedLecture(item)}
    >
      <View>
        <Text style={styles.courseName}>{item.courses.name}</Text>
        <Text style={styles.courseTime}>{item.start_time.slice(0,5)} - {item.end_time.slice(0,5)}</Text>
        <Text style={styles.groups}>Groups: {item.schedule_groups.map(sg => sg.student_groups.group_name).join(', ')}</Text>
      </View>
      {selectedLecture?.id === item.id && <View style={styles.radio} />}
    </TouchableOpacity>
  );

  if (!device && isScanning) return <View style={styles.container}><Text>Loading Camera...</Text></View>;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>Today's Classes</Text>
        <TouchableOpacity onPress={fetchLectures} style={styles.refreshBtn}>
          <Text style={styles.refreshText}>↻</Text>
        </TouchableOpacity>
      </View>

      {!isScanning && (
        <FlatList
          data={lectures}
          renderItem={renderLectureItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={<Text style={styles.emptyText}>{loading ? "Loading..." : "No classes today."}</Text>}
        />
      )}

      {isScanning && (
        <View style={styles.cameraContainer}>
          <Camera
            ref={camera}
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={true}
            photo={true} // Enable photo capture capability
          />
          <View style={styles.overlay}>
            <Text style={styles.overlayText}>{status}</Text>
          </View>
          <TouchableOpacity style={styles.flipBtn} onPress={toggleCameraFacing}>
             <Text style={styles.flipText}>Flip Camera</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.footer}>
        {isScanning ? (
           <TouchableOpacity style={[styles.button, styles.stopBtn]} onPress={stopScanning}>
             <Text style={styles.btnText}>Stop Attendance</Text>
           </TouchableOpacity>
        ) : (
           <TouchableOpacity 
             style={[styles.button, !selectedLecture && styles.disabledBtn]} 
             onPress={startScanning}
             disabled={!selectedLecture}
           >
             <Text style={styles.btnText}>
               {selectedLecture ? `Start Class: ${selectedLecture.courses.course_code || 'Selected'}` : 'Select a Class'}
             </Text>
           </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  header: { fontSize: 28, fontWeight: 'bold', color: '#1e293b' },
  refreshBtn: { padding: 8, backgroundColor: '#e2e8f0', borderRadius: 20 },
  refreshText: { fontSize: 20, fontWeight: 'bold' },
  listContainer: { paddingHorizontal: 20 },
  card: { 
    backgroundColor: 'white', padding: 20, borderRadius: 16, marginBottom: 12,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 
  },
  selectedCard: { borderColor: '#4f46e5', borderWidth: 2, backgroundColor: '#eef2ff' },
  courseName: { fontSize: 18, fontWeight: 'bold', color: '#334155' },
  courseTime: { fontSize: 14, color: '#64748b', marginTop: 4 },
  groups: { fontSize: 12, color: '#94a3b8', marginTop: 4 },
  emptyText: { textAlign: 'center', marginTop: 50, color: '#94a3b8', fontSize: 16 },
  radio: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#4f46e5' },
  cameraContainer: { flex: 1, margin: 20, borderRadius: 20, overflow: 'hidden', position: 'relative' },
  overlay: { position: 'absolute', bottom: 20, left: 20, backgroundColor: 'rgba(0,0,0,0.6)', padding: 8, borderRadius: 8 },
  overlayText: { color: 'white', fontWeight: 'bold' },
  flipBtn: { 
    position: 'absolute', top: 20, right: 20, backgroundColor: 'rgba(0,0,0,0.5)', 
    paddingVertical: 10, paddingHorizontal: 15, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.8)'
  },
  flipText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  footer: { padding: 20, backgroundColor: 'white', borderTopWidth: 1, borderColor: '#e2e8f0' },
  button: { padding: 16, borderRadius: 12, alignItems: 'center', backgroundColor: '#4f46e5' },
  stopBtn: { backgroundColor: '#ef4444' },
  disabledBtn: { backgroundColor: '#cbd5e1' },
  btnText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
});