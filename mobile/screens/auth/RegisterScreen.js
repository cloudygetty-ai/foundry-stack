import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';

const RegisterScreen = ({ navigation }) => {
  const { register } = useAuth();
  const [form, setForm] = useState({ email: '', password: '', displayName: '', age: '' });
  const [loading, setLoading] = useState(false);

  const update = (field) => (value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleRegister = async () => {
    const { email, password, displayName, age } = form;
    if (!email || !password || !displayName) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters');
      return;
    }
    const ageNum = parseInt(age, 10);
    if (isNaN(ageNum) || ageNum < 18) {
      Alert.alert('Error', 'You must be 18 or older to register');
      return;
    }

    setLoading(true);
    const result = await register(email.toLowerCase().trim(), password, displayName, ageNum);
    setLoading(false);

    if (!result.success) {
      Alert.alert('Registration Failed', result.error || 'Please try again');
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Join and start connecting</Text>
        </View>

        <View style={styles.form}>
          {[
            { label: 'Display Name', field: 'displayName', placeholder: 'Your name', keyboard: 'default' },
            { label: 'Email', field: 'email', placeholder: 'your@email.com', keyboard: 'email-address', caps: 'none' },
            { label: 'Age', field: 'age', placeholder: 'Must be 18+', keyboard: 'numeric' },
            { label: 'Password', field: 'password', placeholder: 'Min 8 characters', secure: true },
          ].map(({ label, field, placeholder, keyboard, caps, secure }) => (
            <View key={field} style={styles.inputContainer}>
              <Text style={styles.label}>{label}</Text>
              <TextInput
                style={styles.input}
                placeholder={placeholder}
                placeholderTextColor="#999"
                value={form[field]}
                onChangeText={update(field)}
                keyboardType={keyboard || 'default'}
                autoCapitalize={caps || 'words'}
                secureTextEntry={!!secure}
                editable={!loading}
              />
            </View>
          ))}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create Account</Text>}
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.linkText}>Sign In</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 24, paddingTop: 60 },
  header: { marginBottom: 32 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#1f2937', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#6b7280' },
  form: { width: '100%' },
  inputContainer: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
  input: {
    backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb',
    borderRadius: 12, padding: 16, fontSize: 16, color: '#1f2937',
  },
  button: {
    backgroundColor: '#6366f1', borderRadius: 12, padding: 16,
    alignItems: 'center', marginTop: 8,
    shadowColor: '#6366f1', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  footerText: { fontSize: 14, color: '#6b7280' },
  linkText: { fontSize: 14, color: '#6366f1', fontWeight: '600' },
});

export default RegisterScreen;
