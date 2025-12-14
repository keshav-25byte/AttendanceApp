import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, SafeAreaView, Dimensions, Alert, ActivityIndicator } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '../lib/supabase';

// Helper for screen dimensions
const { width: SCREEN_WIDTH } = Dimensions.get('window');

// WebSocket URL from environment variables
const FACE_API_WS_URL = process.env.EXPO_PUBLIC_FACE_API_WS_URL;

export default function CameraScreen({ route, navigation }) {
  const { lecture } = route.params || {};
  const { hasPermission, requestPermission } = useCameraPermission();
  
  const [isScanning, setIsScanning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState('Idle');
  const [facing, setFacing] = useState('front');
  
  // Camera & WebSocket refs
  const device = useCameraDevice(facing);
  const camera = useRef(null);
  const ws = useRef(null);
  
  const scanInterval = useRef(null);
  const isProcessing = useRef(false);

  const [markedStudents, setMarkedStudents] = useState([]);
  const [faceBoxes, setFaceBoxes] = useState([]); 

  useEffect(() => {
    // Initialize permissions and start scanning on mount
    const init = async () => {
      const granted = await requestPermission();
      if (granted) {
        startScanning();
      } else {
        Alert.alert("Permission Required", "Camera permission is required to mark attendance.");
        navigation.goBack();
      }
    };
    init();

    return () => stopScanning();
  }, []);

  function toggleCameraFacing() {
    setFacing(current => (current === 'back' ? 'front' : 'back'));
  }

  const startScanning = async () => {
    const groupIds = lecture?.schedule_groups?.map(sg => sg?.student_groups?.id) || [];
    
    setIsScanning(true);
    setStatus('Connecting...');
    setMarkedStudents([]);

    ws.current = new WebSocket(`${FACE_API_WS_URL}/ws/start_attendance`);

    ws.current.onopen = () => {
      setStatus('Connected');
      // Send group IDs to initialize the session
      ws.current.send(JSON.stringify({ group_ids: groupIds }));
    };

    ws.current.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        
        // Backend is ready to receive frames
        if (data.type === 'status' && data.message === 'ready') {
          setStatus('Scanning...');
          startCaptureInterval();
        }
        
        // Update bounding boxes for UI feedback
        if (data.type === 'frame_data' && data.boxes) {
            setFaceBoxes(data.boxes);
        }

        // Student identified
        if (data.type === 'match') {
          setStatus(`Found: ${data.student.name}`);
          setMarkedStudents(prevStudents => {
            // Avoid duplicates
            if (!prevStudents.find(s => s.id === data.student.id)) {
              return [data.student, ...prevStudents];
            }
            return prevStudents;
          });
        }
      } catch (err) {
        console.error("Error parsing WebSocket message:", err);
      }
    };

    ws.current.onerror = (e) => {
      setStatus('Connection Error');
      console.error("WebSocket Error:", e);
      stopScanning();
    };
    
    ws.current.onclose = () => {
        stopScanning();
    };
  };

  const stopScanning = () => {
    setIsScanning(false);
    setStatus('Stopped');
    if (scanInterval.current) { clearInterval(scanInterval.current); scanInterval.current = null; }
    if (ws.current) ws.current.close();
  };

  const startCaptureInterval = () => {
      if (scanInterval.current) clearInterval(scanInterval.current);
      // Capture frame every 500ms
      scanInterval.current = setInterval(captureAndSend, 500);
  };

  const captureAndSend = async () => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
    if (!camera.current || !device) return;
    if (isProcessing.current) return; // Prevent concurrent processing

    isProcessing.current = true;
    try {
        const photo = await camera.current.takePhoto({ enableShutterSound: false, flash: 'off' });
        
        // Resize and compress to optimize network usage
        const manipulatedImage = await ImageManipulator.manipulateAsync(
            photo.path,
            [{ resize: { width: 500 } }], 
            { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );

        ws.current.send(`data:image/jpeg;base64,${manipulatedImage.base64}`);
        
        // Clean up temporary file
        await FileSystem.deleteAsync(photo.path, { idempotent: true });
    } catch (err) {
        // Log locally but keep UI smooth
        console.log("Capture error:", err);
    } finally {
        isProcessing.current = false;
    }
  };

  const handleSubmitAttendance = async () => {
    if (markedStudents.length === 0) return;
    
    stopScanning(); 
    setIsSubmitting(true);

    try {
        const today = new Date().toISOString().split('T')[0];
        
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
      <View style={styles.cameraContainer}>
        {device ? ( <Camera ref={camera} style={StyleSheet.absoluteFill} device={device} isActive={true} photo={true} /> ) : ( <Text>Loading Camera...</Text> )}
        {renderFaceBoxes()}
        <View style={styles.overlay}><Text style={styles.overlayText}>{status}</Text></View>
        <TouchableOpacity style={styles.flipBtn} onPress={toggleCameraFacing}><Text style={styles.flipText}>Flip</Text></TouchableOpacity>
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

      <View style={styles.footer}>
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
  container: { flex: 1, backgroundColor: '#f8fafc' },
  cameraContainer: { height: '55%', margin: 15, borderRadius: 15, overflow: 'hidden', backgroundColor: '#000', position: 'relative' },
  overlay: { position: 'absolute', bottom: 15, left: 15, backgroundColor: 'rgba(0,0,0,0.7)', padding: 10, borderRadius: 25 },
  overlayText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  boxLabel: { backgroundColor: 'rgba(0,0,0,0.6)', color: 'white', fontSize: 10, padding: 2, textAlign: 'center', position: 'absolute', bottom: -20, left: 0, right: 0 },
  flipBtn: { position: 'absolute', top: 15, right: 15, backgroundColor: 'rgba(0,0,0,0.5)', padding: 10, borderRadius: 20 },
  backBtn: { position: 'absolute', top: 15, left: 15, backgroundColor: 'rgba(0,0,0,0.5)', padding: 10, borderRadius: 20 },
  flipText: { color: 'white', fontWeight: 'bold' },
  listContainer: { flex: 1, backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  listHeader: { padding: 15, borderBottomWidth: 1, borderColor: '#e2e8f0' },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#334155' },
  studentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderColor: '#f1f5f9' },
  studentName: { fontSize: 16, color: '#166534', fontWeight: '500' },
  studentRoll: { fontSize: 14, color: '#64748b' },
  footer: { padding: 20, backgroundColor: 'white', borderTopWidth: 1, borderColor: '#e2e8f0' },
  button: { padding: 15, borderRadius: 10, alignItems: 'center' },
  submitBtn: { backgroundColor: '#10b981' }, 
  stopBtn: { backgroundColor: '#ef4444' },    
  btnText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
});