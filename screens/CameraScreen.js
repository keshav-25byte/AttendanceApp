import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, FlatList, SafeAreaView } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import * as FileSystem from 'expo-file-system';
import { supabase } from '../lib/supabase';

// REPLACE WITH YOUR PUBLIC API URL
const FACE_API_WS_URL = 'ws://YOUR_PUBLIC_IP_OR_DOMAIN:5000';

export default function CameraScreen({ route, navigation }) {
  const { lecture } = route.params; // Get the selected lecture
  const { hasPermission, requestPermission } = useCameraPermission();
  const [isScanning, setIsScanning] = useState(false);
  const [status, setStatus] = useState('Idle');
  const [facing, setFacing] = useState('front');
  const device = useCameraDevice(facing);
  const camera = useRef(null);
  const ws = useRef(null);

  // --- NEW: State for Request #3 ---
  const [markedStudents, setMarkedStudents] = useState([]);

  useEffect(() => {
    requestPermission();
    // Automatically start scanning when screen opens
    startScanning(); 
    return () => stopScanning();
  }, []);

  function toggleCameraFacing() {
    setFacing(current => (current === 'back' ? 'front' : 'back'));
  }

  const startScanning = async () => {
    if (!hasPermission) {
        const granted = await requestPermission();
        if (!granted) return Alert.alert("Camera permission denied");
    }

    const groupIds = lecture.schedule_groups.map(sg => sg.student_groups.id);
    if (groupIds.length === 0) return Alert.alert("Error", "No student groups found.");

    setIsScanning(true);
    setStatus('Connecting...');
    setMarkedStudents([]); // Clear list

    ws.current = new WebSocket(`${FACE_API_WS_URL}/ws/start_attendance`);

    ws.current.onopen = () => {
      setStatus('Connected. Sending Config...');
      ws.current.send(JSON.stringify({ group_ids: groupIds }));
    };

    ws.current.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === 'status' && data.message === 'ready') {
        setStatus(`Scanning: ${lecture.courses.name}...`);
        captureLoop();
      }
      
      // --- NEW: Handle Request #3 ---
      if (data.type === 'match') {
        setStatus(`Found: ${data.student.name}`);
        setMarkedStudents(prevStudents => {
          // Add student only if they are not already in the list
          if (!prevStudents.find(s => s.id === data.student.id)) {
            return [data.student, ...prevStudents];
          }
          return prevStudents;
        });
      }
      // -----------------------------
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
        const photo = await camera.current.takePhoto({
          enableShutterSound: false,
          qualityPrioritization: 'speed',
          flash: 'off'
        });
        const base64 = await FileSystem.readAsStringAsync(photo.path, {
            encoding: FileSystem.EncodingType.Base64,
        });
        ws.current.send(`data:image/jpeg;base64,${base64}`);
        await FileSystem.deleteAsync(photo.path, { idempotent: true });
      } catch (err) {
        console.log("Capture error:", err);
      }
    }
    setTimeout(() => { if (isScanning) captureLoop(); }, 600);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.cameraContainer}>
        {device ? (
          <Camera
            ref={camera}
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={true}
            photo={true}
          />
        ) : (
          <Text>Loading Camera...</Text>
        )}
        <View style={styles.overlay}>
          <Text style={styles.overlayText}>{status}</Text>
        </View>
        <TouchableOpacity style={styles.flipBtn} onPress={toggleCameraFacing}>
           <Text style={styles.flipText}>Flip</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
           <Text style={styles.flipText}>{"<"} Back</Text>
        </TouchableOpacity>
      </View>

      {/* --- NEW: Marked Student List (Request #3) --- */}
      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>Marked Students ({markedStudents.length})</Text>
      </View>
      <FlatList
        data={markedStudents}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <View style={styles.studentRow}>
            <Text style={styles.studentName}>{item.name}</Text>
            <Text style={styles.studentRoll}>Roll: {item.roll_number}</Text>
          </View>
        )}
        style={styles.list}
      />
      {/* ------------------------------------------- */}

      <View style={styles.footer}>
         <TouchableOpacity style={[styles.button, styles.stopBtn]} onPress={() => navigation.goBack()}>
           <Text style={styles.btnText}>Stop & Go Back</Text>
         </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  cameraContainer: { 
    height: '60%', 
    margin: 20, 
    borderRadius: 20, 
    overflow: 'hidden', 
    position: 'relative',
    backgroundColor: '#000'
  },
  overlay: { position: 'absolute', bottom: 20, left: 20, backgroundColor: 'rgba(0,0,0,0.6)', padding: 8, borderRadius: 8 },
  overlayText: { color: 'white', fontWeight: 'bold' },
  flipBtn: { 
    position: 'absolute', top: 20, right: 20, backgroundColor: 'rgba(0,0,0,0.5)', 
    paddingVertical: 10, paddingHorizontal: 15, borderRadius: 20,
  },
  backBtn: {
    position: 'absolute', top: 20, left: 20, backgroundColor: 'rgba(0,0,0,0.5)', 
    paddingVertical: 10, paddingHorizontal: 15, borderRadius: 20,
  },
  flipText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  
  listHeader: { paddingHorizontal: 20, paddingBottom: 10, borderBottomWidth: 1, borderColor: '#e2e8f0' },
  listTitle: { fontSize: 18, fontWeight: 'bold', color: '#334155' },
  list: { flex: 1, paddingHorizontal: 20 },
  studentRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 1, borderColor: '#f1f5f9'
  },
  studentName: { fontSize: 16, color: '#1e293b' },
  studentRoll: { fontSize: 14, color: '#64748b' },
  
  footer: { padding: 20, backgroundColor: 'white', borderTopWidth: 1, borderColor: '#e2e8f0' },
  button: { padding: 16, borderRadius: 12, alignItems: 'center' },
  stopBtn: { backgroundColor: '#ef4444' },
  btnText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
}); 