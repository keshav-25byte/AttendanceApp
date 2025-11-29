// import React, { useState, useEffect, useRef } from 'react';
// import { View, Text, StyleSheet, TouchableOpacity, Alert, FlatList, SafeAreaView } from 'react-native';
// import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
// import * as FileSystem from 'expo-file-system';
// import { supabase } from '../lib/supabase';

// // REPLACE WITH YOUR PUBLIC API URL
// const FACE_API_WS_URL = 'wss://ca.avinya.live';

// export default function CameraScreen({ route, navigation }) {
//   const { lecture } = route.params; // Get the selected lecture
//   const { hasPermission, requestPermission } = useCameraPermission();
//   const [isScanning, setIsScanning] = useState(false);
//   const [status, setStatus] = useState('Idle');
//   const [facing, setFacing] = useState('front');
//   const device = useCameraDevice(facing);
//   const camera = useRef(null);
//   const ws = useRef(null);

  
//   const [errorLog, setErrorLog] = useState(''); 

//   // --- NEW: State for Request #3 ---
//   const [markedStudents, setMarkedStudents] = useState([]);

//   useEffect(() => {
//     requestPermission();
//     // Automatically start scanning when screen opens
//     startScanning(); 
//     return () => stopScanning();
//   }, []);

//   function toggleCameraFacing() {
//     setFacing(current => (current === 'back' ? 'front' : 'back'));
//   }

//   const startScanning = async () => {
//     if (!hasPermission) {
//         const granted = await requestPermission();
//         if (!granted) return Alert.alert("Camera permission denied");
//     }

//     const groupIds = lecture.schedule_groups.map(sg => sg.student_groups.id);
//     if (groupIds.length === 0) return Alert.alert("Error", "No student groups found.");

//     setIsScanning(true);
//     setStatus('Connecting...');
//     setMarkedStudents([]); // Clear list

//     ws.current = new WebSocket(`${FACE_API_WS_URL}/ws/start_attendance`);

//     ws.current.onopen = () => {
//       setStatus('Connected. Sending Config...');
//       ws.current.send(JSON.stringify({ group_ids: groupIds }));
//     };

//     ws.current.onmessage = (e) => {
//       const data = JSON.parse(e.data);
//       if (data.type === 'status' && data.message === 'ready') {
//         setStatus(`Scanning: ${lecture.courses.name}...`);
//         captureLoop();
//       }
      
//       // --- NEW: Handle Request #3 ---
//       if (data.type === 'match') {
//         setStatus(`Found: ${data.student.name}`);
//         setMarkedStudents(prevStudents => {
//           // Add student only if they are not already in the list
//           if (!prevStudents.find(s => s.id === data.student.id)) {
//             return [data.student, ...prevStudents];
//           }
//           return prevStudents;
//         });
//       }
//       // -----------------------------
//     };

//     ws.current.onerror = (e) => {
//       console.log("WS Error:", e.message);
//       setStatus('Connection Error');
//       setErrorLog(`WebSocket Error: ${e.message}`); // Add this
//       setIsScanning(false);
//     };
//   };

//   const stopScanning = () => {
//     setIsScanning(false);
//     setStatus('Idle');
//     if (ws.current) ws.current.close();
//   };

//   const captureLoop = async () => {
//     if (!ws.current || ws.current.readyState !== WebSocket.OPEN || !isScanning) return;
//     if (camera.current && device) {
//       try {
//         const photo = await camera.current.takePhoto({
//           enableShutterSound: false,
//           qualityPrioritization: 'speed',
//           flash: 'off'
//         });
//         const base64 = await FileSystem.readAsStringAsync(photo.path, {
//             encoding: FileSystem.EncodingType.Base64,
//         });
//         ws.current.send(`data:image/jpeg;base64,${base64}`);
//         await FileSystem.deleteAsync(photo.path, { idempotent: true });
//       } catch (err) {
//         console.log("Capture error:", err);
//         setErrorLog(`Camera/FS Error: ${err.message}`);
//       }
//     }
//     setTimeout(() => { if (isScanning) captureLoop(); }, 600);
//   };

//   return (
//     <SafeAreaView style={styles.container}>
//       <View style={styles.cameraContainer}>
//         {device ? (
//           <Camera
//             ref={camera}
//             style={StyleSheet.absoluteFill}
//             device={device}
//             isActive={true}
//             photo={true}
//           />
//         ) : (
//           <Text>Loading Camera...</Text>
//         )}
//         <View style={styles.overlay}>
//           <Text style={styles.overlayText}>{status}</Text>
//         </View>
//         <TouchableOpacity style={styles.flipBtn} onPress={toggleCameraFacing}>
//            <Text style={styles.flipText}>Flip</Text>
//         </TouchableOpacity>
//         <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
//            <Text style={styles.flipText}>{"<"} Back</Text>
//         </TouchableOpacity>
//       </View>

//       {/* --- NEW: Marked Student List (Request #3) --- */}
//       <View style={styles.listHeader}>
//         <Text style={styles.listTitle}>Marked Students ({markedStudents.length})</Text>
//       </View>
//       <FlatList
//         data={markedStudents}
//         keyExtractor={(item) => item.id.toString()}
//         renderItem={({ item }) => (
//           <View style={styles.studentRow}>
//             <Text style={styles.studentName}>{item.name}</Text>
//             <Text style={styles.studentRoll}>Roll: {item.roll_number}</Text>
//           </View>
//         )}
//         style={styles.list}
//       />
//       {/* ------------------------------------------- */}

//       {/* --- ERROR LOG UI --- */}
//       {errorLog ? (
//         <View style={styles.errorContainer}>
//           <Text style={styles.errorTitle}>Debug Log:</Text>
//           <Text style={styles.errorText}>{errorLog}</Text>
//           <TouchableOpacity onPress={() => setErrorLog('')}>
//             <Text style={styles.clearText}>Clear</Text>
//           </TouchableOpacity>
//         </View>
//       ) : null}

//       <View style={styles.footer}>
//          <TouchableOpacity style={[styles.button, styles.stopBtn]} onPress={() => navigation.goBack()}>
//            <Text style={styles.btnText}>Stop & Go Back</Text>
//          </TouchableOpacity>
//       </View>
//     </SafeAreaView>
//   );
// }

// const styles = StyleSheet.create({
//   container: { flex: 1, backgroundColor: '#f8fafc' },
//   cameraContainer: { 
//     height: '60%', 
//     margin: 20, 
//     borderRadius: 20, 
//     overflow: 'hidden', 
//     position: 'relative',
//     backgroundColor: '#000'
//   },
//   overlay: { position: 'absolute', bottom: 20, left: 20, backgroundColor: 'rgba(0,0,0,0.6)', padding: 8, borderRadius: 8 },
//   overlayText: { color: 'white', fontWeight: 'bold' },
//   flipBtn: { 
//     position: 'absolute', top: 20, right: 20, backgroundColor: 'rgba(0,0,0,0.5)', 
//     paddingVertical: 10, paddingHorizontal: 15, borderRadius: 20,
//   },
//   backBtn: {
//     position: 'absolute', top: 20, left: 20, backgroundColor: 'rgba(0,0,0,0.5)', 
//     paddingVertical: 10, paddingHorizontal: 15, borderRadius: 20,
//   },
//   flipText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  
//   listHeader: { paddingHorizontal: 20, paddingBottom: 10, borderBottomWidth: 1, borderColor: '#e2e8f0' },
//   listTitle: { fontSize: 18, fontWeight: 'bold', color: '#334155' },
//   list: { flex: 1, paddingHorizontal: 20 },
//   studentRow: {
//     flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
//     paddingVertical: 12, borderBottomWidth: 1, borderColor: '#f1f5f9'
//   },
//   studentName: { fontSize: 16, color: '#1e293b' },
//   studentRoll: { fontSize: 14, color: '#64748b' },
  
//   footer: { padding: 20, backgroundColor: 'white', borderTopWidth: 1, borderColor: '#e2e8f0' },
//   button: { padding: 16, borderRadius: 12, alignItems: 'center' },
//   stopBtn: { backgroundColor: '#ef4444' },
//   btnText: { color: 'white', fontSize: 16, fontWeight: 'bold' },

//   errorContainer: {
//     backgroundColor: 'rgba(255, 0, 0, 0.1)',
//     borderWidth: 1,
//     borderColor: 'red',
//     margin: 20,
//     padding: 10,
//     borderRadius: 8,
//   },
//   errorTitle: {
//     color: 'red',
//     fontWeight: 'bold',
//     marginBottom: 4,
//   },
//   errorText: {
//     color: 'red',
//     fontSize: 12,
//   },
//   clearText: {
//     color: '#334155',
//     fontSize: 12,
//     marginTop: 8,
//     textDecorationLine: 'underline',
//   },
// }); 



import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, FlatList, SafeAreaView, ScrollView } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import * as FileSystem from 'expo-file-system';

// REPLACE WITH YOUR PUBLIC API URL
const FACE_API_WS_URL = 'wss://echo.websocket.org';

export default function CameraScreen({ route, navigation }) {
  const { lecture } = route.params || {}; // Added safety check per advice
  const { hasPermission, requestPermission } = useCameraPermission();
  
  const [isScanning, setIsScanning] = useState(false);
  const [status, setStatus] = useState('Idle');
  const [facing, setFacing] = useState('front');
  const device = useCameraDevice(facing);
  const camera = useRef(null);
  const ws = useRef(null);

  const [markedStudents, setMarkedStudents] = useState([]);
  
  // --- VISUAL CUE STATE ---
  const [logs, setLogs] = useState([]);
  const [indicatorColor, setIndicatorColor] = useState('#94a3b8'); // Gray (Idle)

  // Helper to add logs to UI and Console simultaneously
  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString().split(' ')[0];
    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'action' ? '⚡' : 'ℹ️';
    const newLog = `[${timestamp}] ${icon} ${message}`;
    
    console.log(newLog); // Console log
    setLogs(prev => [newLog, ...prev].slice(0, 50)); // UI Log (Keep last 50)

    // Visual Color Cues
    if (type === 'action') setIndicatorColor('#3b82f6'); // Blue (Working)
    if (type === 'wait') setIndicatorColor('#eab308');   // Yellow (Sending/Waiting)
    if (type === 'success') setIndicatorColor('#22c55e'); // Green (Success)
    if (type === 'error') setIndicatorColor('#ef4444');   // Red (Error)
  };

  useEffect(() => {
    requestPermission();
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

    // Safety check for params
    const groupIds = lecture?.schedule_groups?.map(sg => sg?.student_groups?.id) || [];
    if (groupIds.length === 0) {
        addLog("No groups found in lecture param", 'error');
        return Alert.alert("Error", "No student groups found.");
    }

    setIsScanning(true);
    setStatus('Connecting...');
    addLog('Initiating WebSocket Connection...', 'wait');
    setMarkedStudents([]);

    ws.current = new WebSocket(`${FACE_API_WS_URL}/ws/start_attendance`);

    ws.current.onopen = () => {
      setStatus('Connected');
      addLog('WS Open. Sending Group Config...', 'action');
      ws.current.send(JSON.stringify({ group_ids: groupIds }));
    };

    ws.current.onmessage = (e) => {
      const data = JSON.parse(e.data);
      
      if (data.type === 'status' && data.message === 'ready') {
        setStatus(`Scanning...`);
        addLog('Server Ready. Starting Capture Loop.', 'success');
        captureLoop();
      }
      
      if (data.type === 'match') {
        // Visual Cue: Green Flash
        setIndicatorColor('#22c55e');
        setStatus(`Found: ${data.student.name}`);
        addLog(`MATCH: ${data.student.name}`, 'success');

        setMarkedStudents(prevStudents => {
          if (!prevStudents.find(s => s.id === data.student.id)) {
            return [data.student, ...prevStudents];
          }
          return prevStudents;
        });
      }

      if (data.type === 'no_match') {
        // Optional: Log no match if you want really verbose logs
        // addLog('No match found in frame', 'info'); 
      }
    };

    ws.current.onerror = (e) => {
      addLog(`WS Error: ${e.message}`, 'error');
      setStatus('Connection Error');
      setIsScanning(false);
    };
    
    ws.current.onclose = () => {
        addLog('WebSocket Connection Closed', 'info');
    };
  };

  const stopScanning = () => {
    setIsScanning(false);
    setStatus('Stopped');
    addLog('Scanning Stopped', 'info');
    if (ws.current) ws.current.close();
  };

  const captureLoop = async () => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN || !isScanning) return;
    
    if (camera.current && device) {
      try {
        // STEP 1: Capture
        addLog('📸 Shutter Triggered', 'action'); 
        const photo = await camera.current.takePhoto({
          enableShutterSound: false,
          qualityPrioritization: 'speed',
          flash: 'off'
        });

        // STEP 2: Encode
        addLog('⚙️ Encoding Base64...', 'wait');
        const base64 = await FileSystem.readAsStringAsync(photo.path, {
            encoding: FileSystem.EncodingType.Base64,
        });

        // STEP 3: Send
        addLog(`🚀 Sending (${base64.length} bytes)`, 'wait');
        ws.current.send(`data:image/jpeg;base64,${base64}`);

        // STEP 4: Cleanup
        await FileSystem.deleteAsync(photo.path, { idempotent: true });
        addLog('🧹 Temp file cleaned', 'info');

      } catch (err) {
        addLog(`Loop Error: ${err.message}`, 'error');
      }
    }
    
    // Loop interval
    setTimeout(() => { if (isScanning) captureLoop(); }, 600);
  };

  return (
    <SafeAreaView style={styles.container}>
      
      {/* CAMERA SECTION */}
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
          <View style={styles.centerContent}><Text>Loading Camera...</Text></View>
        )}
        
        {/* Visual Status Overlay */}
        <View style={styles.overlay}>
          {/* The Colored Dot Indicator */}
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

      {/* DEBUG / ACTIVITY LOG (New Feature) */}
      <View style={styles.logContainer}>
        <Text style={styles.sectionTitle}>System Activity:</Text>
        <ScrollView style={styles.logScroll} nestedScrollEnabled={true}>
            {logs.map((log, index) => (
                <Text key={index} style={styles.logText}>{log}</Text>
            ))}
        </ScrollView>
      </View>

      {/* MARKED STUDENTS LIST */}
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
    height: '40%', // Reduced height to make room for logs
    margin: 15, 
    borderRadius: 15, 
    overflow: 'hidden', 
    backgroundColor: '#000',
    position: 'relative'
  },
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  // Status Overlay Styles
  overlay: { 
    position: 'absolute', 
    bottom: 15, 
    left: 15, 
    backgroundColor: 'rgba(0,0,0,0.7)', 
    padding: 10, 
    borderRadius: 25,
    flexDirection: 'row',
    alignItems: 'center'
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'white'
  },
  overlayText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  
  // Buttons
  flipBtn: { position: 'absolute', top: 15, right: 15, backgroundColor: 'rgba(0,0,0,0.5)', padding: 10, borderRadius: 20 },
  backBtn: { position: 'absolute', top: 15, left: 15, backgroundColor: 'rgba(0,0,0,0.5)', padding: 10, borderRadius: 20 },
  flipText: { color: 'white', fontWeight: 'bold' },

  // Log Section Styles
  logContainer: {
    height: '20%',
    marginHorizontal: 15,
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10
  },
  logScroll: { flex: 1 },
  logText: { color: '#cbd5e1', fontSize: 10, fontFamily: 'monospace', marginBottom: 2 },

  // List Section
  listContainer: { flex: 1, backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  listHeader: { padding: 15, borderBottomWidth: 1, borderColor: '#e2e8f0' },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#334155' },
  studentRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 15, borderBottomWidth: 1, borderColor: '#f1f5f9'
  },
  studentName: { fontSize: 16, color: '#166534', fontWeight: '500' },
  studentRoll: { fontSize: 14, color: '#64748b' },

  footer: { padding: 15, backgroundColor: 'white', borderTopWidth: 1, borderColor: '#e2e8f0' },
  button: { padding: 15, borderRadius: 10, alignItems: 'center' },
  stopBtn: { backgroundColor: '#ef4444' },
  btnText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
});