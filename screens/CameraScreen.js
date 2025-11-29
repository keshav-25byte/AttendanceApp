import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, SafeAreaView, ScrollView, Dimensions, Alert, ActivityIndicator } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '../lib/supabase'; // <--- 1. Import Supabase

// REPLACE WITH YOUR REAL SERVER URL
const FACE_API_WS_URL = 'wss://ca.avinya.live'; 

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function CameraScreen({ route, navigation }) {
  const { lecture } = route.params || {};
  const { hasPermission, requestPermission } = useCameraPermission();
  
  const [isScanning, setIsScanning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false); // <--- 2. Add submitting state
  const [status, setStatus] = useState('Idle');
  const [facing, setFacing] = useState('front');
  const device = useCameraDevice(facing);
  const camera = useRef(null);
  const ws = useRef(null);
  
  const scanInterval = useRef(null);
  const isProcessing = useRef(false);

  const [markedStudents, setMarkedStudents] = useState([]);
  const [faceBoxes, setFaceBoxes] = useState([]); 
  const [logs, setLogs] = useState([]);
  const [indicatorColor, setIndicatorColor] = useState('#94a3b8');

  // ... (Keep existing addLog, useEffect, toggleCameraFacing) ...
  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString().split(' ')[0];
    const newLog = `[${timestamp}] ${type === 'error' ? '❌' : 'ℹ️'} ${message}`;
    console.log(newLog);
    setLogs(prev => [newLog, ...prev].slice(0, 50));
    if (type === 'action') setIndicatorColor('#3b82f6'); 
    if (type === 'wait') setIndicatorColor('#eab308');   
    if (type === 'success') setIndicatorColor('#22c55e'); 
    if (type === 'error') setIndicatorColor('#ef4444');   
  };

  useEffect(() => {
    requestPermission();
    startScanning(); 
    return () => stopScanning();
  }, []);

  function toggleCameraFacing() {
    setFacing(current => (current === 'back' ? 'front' : 'back'));
  }

  // ... (Keep startScanning, stopScanning, captureLoop, captureAndSend) ...
  const startScanning = async () => {
    // ... existing logic ...
    const groupIds = lecture?.schedule_groups?.map(sg => sg?.student_groups?.id) || [];
    setIsScanning(true);
    setStatus('Connecting...');
    ws.current = new WebSocket(`${FACE_API_WS_URL}/ws/start_attendance`);

    ws.current.onopen = () => {
      setStatus('Connected');
      ws.current.send(JSON.stringify({ group_ids: groupIds }));
    };

    ws.current.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'status' && data.message === 'ready') {
          setStatus('Scanning...');
          startCaptureInterval();
        }
        if (data.type === 'frame_data' && data.boxes) {
            setFaceBoxes(data.boxes);
            if(data.boxes.length > 0) setIndicatorColor('#22c55e'); 
        }
        if (data.type === 'match') {
          setStatus(`Found: ${data.student.name}`);
          setMarkedStudents(prevStudents => {
            if (!prevStudents.find(s => s.id === data.student.id)) {
              return [data.student, ...prevStudents];
            }
            return prevStudents;
          });
        }
      } catch (err) { }
    };
    // ... existing error handlers ...
    ws.current.onerror = (e) => { setStatus('Connection Error'); stopScanning(); };
    ws.current.onclose = () => { stopScanning(); };
  };

  const stopScanning = () => {
    setIsScanning(false);
    setStatus('Stopped');
    if (scanInterval.current) { clearInterval(scanInterval.current); scanInterval.current = null; }
    if (ws.current) ws.current.close();
  };

  const startCaptureInterval = () => {
      if (scanInterval.current) clearInterval(scanInterval.current);
      scanInterval.current = setInterval(captureAndSend, 500);
  };

  const captureAndSend = async () => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
    if (!camera.current || !device) return;
    if (isProcessing.current) return; 

    isProcessing.current = true;
    try {
        const photo = await camera.current.takePhoto({ enableShutterSound: false, flash: 'off' });
        const manipulatedImage = await ImageManipulator.manipulateAsync(
            photo.path,
            [{ resize: { width: 500 } }], 
            { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );
        ws.current.send(`data:image/jpeg;base64,${manipulatedImage.base64}`);
        await FileSystem.deleteAsync(photo.path, { idempotent: true });
    } catch (err) {
        addLog(`Capture Error: ${err.message}`, 'error');
    } finally {
        isProcessing.current = false;
    }
  };

  // 3. New Submit Function
  const handleSubmitAttendance = async () => {
    if (markedStudents.length === 0) return;
    
    stopScanning(); // Stop camera while submitting
    setIsSubmitting(true);

    try {
        const today = new Date().toISOString().split('T')[0];
        
        // Prepare records: only mark found students as 'present'
        const records = markedStudents.map(student => ({
            student_id: student.id,
            date: today,
            status: 'present',
            schedule_id: lecture.id,
            marked_at: new Date().toISOString()
        }));

        const { error } = await supabase
            .from('attendance')
            .upsert(records, { onConflict: 'student_id, date, schedule_id' });

        if (error) throw error;

        Alert.alert("Success", "Attendance submitted successfully!", [
            { text: "OK", onPress: () => navigation.goBack() }
        ]);

    } catch (error) {
        Alert.alert("Error", error.message);
        // Restart scanning if failed? Optional.
    } finally {
        setIsSubmitting(false);
    }
  };

  const renderFaceBoxes = () => {
    return faceBoxes.map((face, index) => {
        const scaleFactor = SCREEN_WIDTH / 500;
        const [x1, y1, x2, y2] = face.box;
        return (
            <View key={index} style={{
                position: 'absolute',
                left: x1 * scaleFactor, top: y1 * scaleFactor,
                width: (x2 - x1) * scaleFactor, height: (y2 - y1) * scaleFactor,
                borderWidth: 2, borderColor: face.color === 'green' ? '#22c55e' : '#ef4444',
                zIndex: 10,
            }}>
                <Text style={styles.boxLabel}>{face.label}</Text>
            </View>
        );
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* ... (Camera View & Log Container remain the same) ... */}
      <View style={styles.cameraContainer}>
        {device ? ( <Camera ref={camera} style={StyleSheet.absoluteFill} device={device} isActive={true} photo={true} /> ) : ( <Text>Loading...</Text> )}
        {renderFaceBoxes()}
        <View style={styles.overlay}><Text style={styles.overlayText}>{status}</Text></View>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}><Text style={styles.flipText}>{"<"} Back</Text></TouchableOpacity>
      </View>

      <View style={styles.listContainer}>
        <View style={styles.listHeader}>
          <Text style={styles.sectionTitle}>Marked Students ({markedStudents.length})</Text>
        </View>
        <FlatList
          data={markedStudents}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <View style={styles.studentRow}>
              <Text style={styles.studentName}>✅ {item.name}</Text>
              <Text style={styles.studentRoll}>{item.roll_number}</Text>
            </View>
          )}
        />
      </View>

      {/* 4. Updated Footer with Two Buttons */}
      <View style={styles.footer}>
         {/* Submit Button - Only visible if students are found */}
         {markedStudents.length > 0 && (
             <TouchableOpacity 
                style={[styles.button, styles.submitBtn]} 
                onPress={handleSubmitAttendance}
                disabled={isSubmitting}
             >
                {isSubmitting ? <ActivityIndicator color="white" /> : <Text style={styles.btnText}>Submit Attendance</Text>}
             </TouchableOpacity>
         )}
         
         <TouchableOpacity style={[styles.button, styles.stopBtn, { marginTop: 10 }]} onPress={() => navigation.goBack()}>
           <Text style={styles.btnText}>Stop & Go Back</Text>
         </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // ... (keep existing styles)
  container: { flex: 1, backgroundColor: '#f8fafc' },
  cameraContainer: { height: '45%', margin: 15, borderRadius: 15, overflow: 'hidden', backgroundColor: '#000', position: 'relative' },
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  overlay: { position: 'absolute', bottom: 15, left: 15, backgroundColor: 'rgba(0,0,0,0.7)', padding: 10, borderRadius: 25 },
  overlayText: { color: 'white', fontWeight: 'bold' },
  boxLabel: { backgroundColor: 'rgba(0,0,0,0.6)', color: 'white', fontSize: 10, padding: 2, textAlign: 'center', position: 'absolute', bottom: -20, left: 0, right: 0 },
  flipBtn: { position: 'absolute', top: 15, right: 15, padding: 10 },
  backBtn: { position: 'absolute', top: 15, left: 15, backgroundColor: 'rgba(0,0,0,0.5)', padding: 10, borderRadius: 20 },
  flipText: { color: 'white', fontWeight: 'bold' },
  logContainer: { height: '5%', marginHorizontal: 15 }, // Reduced log size
  listContainer: { flex: 1, backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  listHeader: { padding: 15, borderBottomWidth: 1, borderColor: '#e2e8f0' },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#334155' },
  studentRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, borderBottomWidth: 1, borderColor: '#f1f5f9' },
  studentName: { fontSize: 16, color: '#166534', fontWeight: '500' },
  studentRoll: { fontSize: 14, color: '#64748b' },
  
  // Footer Styles
  footer: { padding: 20, backgroundColor: 'white', borderTopWidth: 1, borderColor: '#e2e8f0' },
  button: { padding: 15, borderRadius: 10, alignItems: 'center' },
  submitBtn: { backgroundColor: '#10b981' }, // Green for submit
  stopBtn: { backgroundColor: '#ef4444' },    // Red for stop
  btnText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
});