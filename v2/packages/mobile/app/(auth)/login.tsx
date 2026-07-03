import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../src/lib/auth-store';
import { colors } from '../../src/lib/colors';

export default function LoginScreen() {
  const router = useRouter();
  const { login, isLoading, error, clearError } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function handleLogin() {
    clearError();
    await login(email, password);
    if (useAuthStore.getState().isAuthenticated) {
      router.replace('/(tabs)/dashboard');
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.logoContainer}>
        <View style={styles.logoIcon}>
          <Text style={styles.logoText}>A</Text>
        </View>
        <Text style={styles.title}>Asimov ERP</Text>
        <Text style={styles.subtitle}>Ingresá a tu cuenta</Text>
      </View>

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={colors.ink[400]}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <TextInput
          style={styles.input}
          placeholder="Contraseña"
          placeholderTextColor={colors.ink[400]}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.buttonText}>Iniciar sesión</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.ink[900],
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logoIcon: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: colors.ion[500],
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  logoText: {
    color: colors.white,
    fontSize: 28,
    fontWeight: '700',
  },
  title: {
    color: colors.white,
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.ink[400],
    fontSize: 14,
    marginTop: 4,
  },
  form: {
    gap: 16,
  },
  input: {
    backgroundColor: colors.ink[800],
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.white,
    borderWidth: 1,
    borderColor: colors.ink[700],
  },
  button: {
    backgroundColor: colors.ion[500],
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  errorContainer: {
    backgroundColor: 'rgba(220, 38, 38, 0.1)',
    borderRadius: 8,
    padding: 12,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
  },
});
