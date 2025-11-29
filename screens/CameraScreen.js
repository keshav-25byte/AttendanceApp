
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, SafeAreaView, ScrollView, Dimensions, Alert } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';

// REPLACE WITH YOUR REAL SERVER URL
const FACE_API_WS_URL = 'wss://ca.avinya.live'; 

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function CameraScreen({ route, navigation }) {
  const { lecture } = route.params || {};
  const { hasPermission, requestPermission } = useCameraPermission();
  
  const [isScanning, setIsScanning] = useState(false);
  const [status, setStatus] = useState('Idle');
  const [facing, setFacing] = useState('front');
  const device = useCameraDevice(facing);
  const camera = useRef(null);
  const ws = useRef(null);
  
  // Refs for loop control (matches website logic)
  const scanInterval = useRef(null);
  const isProcessing = useRef(false);

  const [markedStudents, setMarkedStudents] = useState([]);
  const [faceBoxes, setFaceBoxes] = useState([]); 
  const [logs, setLogs] = useState([]);
  const [indicatorColor, setIndicatorColor] = useState('#94a3b8');

  // --- LOGGING HELPER ---
  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString().split(' ')[0];
    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'action' ? '⚡' : 'ℹ️';
    const newLog = `[${timestamp}] ${icon} ${message}`;
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

  // --- WEBSOCKET CONNECTION ---
  const startScanning = async () => {
    if (!hasPermission) {
        const granted = await requestPermission();
        if (!granted) return Alert.alert("Camera permission denied");
    }

    const groupIds = lecture?.schedule_groups?.map(sg => sg?.student_groups?.id) || [];
    
    setIsScanning(true);
    setStatus('Connecting...');
    addLog('Initiating WebSocket Connection...', 'wait');
    setMarkedStudents([]);

    ws.current = new WebSocket(`${FACE_API_WS_URL}/ws/start_attendance`);

    ws.current.onopen = () => {
      setStatus('Connected');
      addLog('WS Open. Sending Config...', 'action');
      ws.current.send(JSON.stringify({ group_ids: groupIds }));
    };

    ws.current.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        
        // 1. Start Loop when Server is Ready
        if (data.type === 'status' && data.message === 'ready') {
          setStatus('Scanning...');
          addLog('Server Ready. Starting Interval.', 'success');
          startCaptureInterval(); // Start the loop
        }
        
        // 2. Draw Boxes
        if (data.type === 'frame_data' && data.boxes) {
            setFaceBoxes(data.boxes);
            if(data.boxes.length > 0) setIndicatorColor('#22c55e'); 
        }

        // 3. Handle Match
        if (data.type === 'match') {
          setStatus(`Found: ${data.student.name}`);
          addLog(`MATCH: ${data.student.name}`, 'success');
          setMarkedStudents(prevStudents => {
            if (!prevStudents.find(s => s.id === data.student.id)) {
              return [data.student, ...prevStudents];
            }
            return prevStudents;
          });
        }
      } catch (err) { }
    };

    ws.current.onerror = (e) => {
      const msg = e.message || JSON.stringify(e);
      addLog(`WS Error: ${msg}`, 'error');
      setStatus('Connection Error');
      stopScanning();
    };
    
    ws.current.onclose = () => {
        addLog('WebSocket Connection Closed', 'info');
        stopScanning();
    };
  };

  const stopScanning = () => {
    setIsScanning(false);
    setStatus('Stopped');
    
    // Clear Interval (Stop the loop)
    if (scanInterval.current) {
        clearInterval(scanInterval.current);
        scanInterval.current = null;
    }
    
    if (ws.current) ws.current.close();
  };

  // --- CAPTURE LOGIC (Matches Website setInterval) ---
  const startCaptureInterval = () => {
      if (scanInterval.current) clearInterval(scanInterval.current);
      
      // Run every 500ms (2 FPS) - Safer for mobile
      scanInterval.current = setInterval(captureAndSend, 500);
  };

  const captureAndSend = async () => {
    // 1. Safety Checks
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
    if (!camera.current || !device) return;
    
    // 2. Concurrency Lock (Don't take a new photo if previous is still processing)
    if (isProcessing.current) {
        // console.log("Skipping frame, still processing...");
        return; 
    }

    isProcessing.current = true;

    try {
        // 3. Take Photo (Simplified options to prevent hangs)
        const photo = await camera.current.takePhoto({
          enableShutterSound: false,
          flash: 'off'
        });

        // 4. Resize (Matches Website Canvas Logic)
        const manipulatedImage = await ImageManipulator.manipulateAsync(
            photo.path,
            [{ resize: { width: 500 } }], 
            { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );

        // 5. Send
        ws.current.send(`data:image/jpeg;base64,${manipulatedImage.base64}`);
        
        // 6. Cleanup
        await FileSystem.deleteAsync(photo.path, { idempotent: true });

    } catch (err) {
        addLog(`Capture Error: ${err.message}`, 'error');
    } finally {
        isProcessing.current = false; // Release lock
    }
  };

  // --- RENDER HELPERS ---
  const renderFaceBoxes = () => {
    return faceBoxes.map((face, index) => {
        const scaleFactor = SCREEN_WIDTH / 500;
        const [x1, y1, x2, y2] = face.box;
        
        return (
            <View key={index} style={{
                position: 'absolute',
                left: x1 * scaleFactor,
                top: y1 * scaleFactor,
                width: (x2 - x1) * scaleFactor,
                height: (y2 - y1) * scaleFactor,
                borderWidth: 2,
                borderColor: face.color === 'green' ? '#22c55e' : '#ef4444',
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
        {device ? (
          <Camera
            ref={camera}
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={true}
            photo={true} // Crucial for takePhoto to work
          />
        ) : (
          <View style={styles.centerContent}><Text>Loading Camera...</Text></View>
        )}
        
        {renderFaceBoxes()}

        <View style={styles.overlay}>
          <View style={[styles.statusDot, { backgroundColor: indicatorColor }]} />
          <Text style={styles.overlayText}>{status}</Text>
        </View>

        <TouchableOpacity style={styles.flipBtn} onPress={toggleCameraFacing}>
           <Text style={styles.flipText}>Flip</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
           <Text style={styles.flipText}>{"<"} Back</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.logContainer}>
        <Text style={styles.sectionTitle}>System Activity:</Text>
        <ScrollView style={styles.logScroll} nestedScrollEnabled={true}>
            {logs.map((log, index) => (
                <Text key={index} style={styles.logText}>{log}</Text>
            ))}
        </ScrollView>
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
    height: '45%', 
    margin: 15, 
    borderRadius: 15, 
    overflow: 'hidden', 
    backgroundColor: '#000',
    position: 'relative'
  },
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  overlay: { 
    position: 'absolute', bottom: 15, left: 15, 
    backgroundColor: 'rgba(0,0,0,0.7)', padding: 10, borderRadius: 25,
    flexDirection: 'row', alignItems: 'center'
  },
  statusDot: {
    width: 12, height: 12, borderRadius: 6, marginRight: 8,
    borderWidth: 1, borderColor: 'white'
  },
  overlayText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  boxLabel: {
      backgroundColor: 'rgba(0,0,0,0.6)', color: 'white', fontSize: 10, padding: 2, textAlign: 'center',
      position: 'absolute', bottom: -20, left: 0, right: 0
  },
  flipBtn: { position: 'absolute', top: 15, right: 15, backgroundColor: 'rgba(0,0,0,0.5)', padding: 10, borderRadius: 20 },
  backBtn: { position: 'absolute', top: 15, left: 15, backgroundColor: 'rgba(0,0,0,0.5)', padding: 10, borderRadius: 20 },
  flipText: { color: 'white', fontWeight: 'bold' },
  logContainer: {
    height: '15%', marginHorizontal: 15, backgroundColor: '#1e293b', borderRadius: 10, padding: 10, marginBottom: 10
  },
  logScroll: { flex: 1 },
  logText: { color: '#cbd5e1', fontSize: 10, fontFamily: 'monospace', marginBottom: 2 },
  listContainer: { flex: 1, backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  listHeader: { padding: 15, borderBottomWidth: 1, borderColor: '#e2e8f0' },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#334155' },
  studentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderColor: '#f1f5f9' },
  studentName: { fontSize: 16, color: '#166534', fontWeight: '500' },
  studentRoll: { fontSize: 14, color: '#64748b' },
  footer: { padding: 15, backgroundColor: 'white', borderTopWidth: 1, borderColor: '#e2e8f0' },
  button: { padding: 15, borderRadius: 10, alignItems: 'center' },
  stopBtn: { backgroundColor: '#ef4444' },
  btnText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
});