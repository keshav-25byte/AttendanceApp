import React, { useState } from 'react';
import { View, Image, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { supabase } from '../lib/supabase';

/**
 * Authentication Screen.
 * Handles user login and validates that the user has a 'teacher' role.
 */
export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setLoading(true);

    try {
      // 1. Authenticate with Supabase Auth
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        if (error.message.includes("Invalid login credentials")) {
          throw new Error("Invalid email or password. Please try again.");
        }
        throw error;
      }

      if (!data.user) {
        throw new Error('Login failed: No user data returned.');
      }

      // 2. Check the user's role in the 'profiles' table
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .single();
      
      if (profileError) {
        throw new Error(`Profile check failed: ${profileError.message}`);
      }

      // 3. Allow access only if role is 'teacher'
      if (profile?.role === 'teacher') {
        navigation.replace('ClassList'); 
      } else {
        await supabase.auth.signOut();
        throw new Error('Access Denied: You are not a teacher.');
      }

    } catch (error) {
      let userMessage = error.message;
      if (error.message.includes("Network request failed")) {
          userMessage = "Could not connect to the server. Please check your internet.";
      }
      Alert.alert('Login Failed', userMessage);
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
        placeholder="Enter your email"
        placeholderTextColor="#9ca3af"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        style={styles.input}
        placeholder="Enter your password"
        placeholderTextColor="#9ca3af"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Signing in...' : 'Sign In'}</Text>
      </TouchableOpacity>
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
    color: '#111827'
  },
  button: { backgroundColor: '#005CAB', padding: 15, borderRadius: 10, alignItems: 'center' },
  buttonText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  logo: {
    alignSelf: 'center',
    marginBottom: 20,
    width: 100,
    height: 100, 
  },
});