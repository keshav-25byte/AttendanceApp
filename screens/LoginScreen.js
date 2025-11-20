import React, { useState } from 'react';
import { View, Image, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { supabase } from '../lib/supabase';

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorLog, setErrorLog] = useState(''); // <--- NEW: State for error message

  async function handleLogin() {
    setLoading(true);
    setErrorLog(''); // <--- NEW: Clear old errors

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        // --- CHANGE 1: Give a user-friendly error for bad passwords ---
        if (error.message.includes("Invalid login credentials")) {
          throw new Error("Invalid email or password. Please try again.");
        }
        // -----------------------------------------------------------
        throw error; // Throw other errors to be caught
      }

      if (!data.user) {
        throw new Error('Login failed: No user data returned.');
      }

      // Check profile role
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .single();
      
      if (profileError) {
        // This is a common failure point
        throw new Error(`Profile check failed: ${profileError.message}`);
      }

      if (profile?.role === 'teacher') {
        navigation.replace('ClassList'); // Success
      } else {
        await supabase.auth.signOut();
        throw new Error('Access Denied: You are not a teacher.');
      }

    } catch (error) {
      // <--- NEW: Show the full error on screen
      let userMessage = error.message;
      if (error.message.includes("Network request failed")) {
          userMessage = "Could not connect to the server. Please check your internet.";
      }
      setErrorLog(error.message); // Keep the technical error in the debug log
      Alert.alert('Login Failed', userMessage); // Show the user-friendly one
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Image
        source={require('../assets/images/logo.png')}
        style={styles.logo}
      />
      <Text style={styles.title}>SAU Attendance</Text>
      <TextInput
        style={styles.input}
        placeholder="Enter your email" // <--- CHANGE 2: Updated placeholder
        placeholderTextColor="#9ca3af" // <--- NEW: Set placeholder color
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        style={styles.input}
        placeholder="Enter your password" // <--- CHANGE 2: Updated placeholder
        placeholderTextColor="#9ca3af" // <--- NEW: Set placeholder color
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Signing in...' : 'Sign In'}</Text>
      </TouchableOpacity>

      {/* --- NEW: VISIBLE ERROR LOG --- */}
      {errorLog ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Debug Error:</Text>
          <Text style={styles.errorLogText}>{errorLog}</Text>
        </View>
      ) : null}
      {/* ----------------------------- */}

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#f0f4f8' },
  title: { fontSize: 32, fontWeight: 'bold', color: '#005CAB', marginBottom: 40, textAlign: 'center' },
  input: { 
    backgroundColor: 'white', 
    padding: 15, 
    borderRadius: 10, 
    marginBottom: 15, 
    fontSize: 16, 
    borderWidth: 1, 
    borderColor: '#ddd',
    color: '#111827' // <--- CHANGE 3: Fixes invisible password dots
  },
  button: { backgroundColor: '#005CAB', padding: 15, borderRadius: 10, alignItems: 'center' },
  buttonText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  logo: {
    alignSelf: 'center', // <--- ADD THIS LINE
    marginBottom: 20,
    width: 100, // You can still style it
    height: 100,
  },
  // --- NEW STYLES FOR ERROR LOG ---
  errorContainer: {
    marginTop: 20,
    padding: 10,
    backgroundColor: '#ffebe6',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ffc5b3'
  },
  errorTitle: {
    color: '#a60000',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  errorLogText: {
    color: '#a60000',
    fontSize: 14,
  },
  // ------------------------------
});