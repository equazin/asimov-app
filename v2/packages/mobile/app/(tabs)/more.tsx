import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../src/lib/auth-store';
import { colors } from '../../src/lib/colors';

interface MenuItem {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  subtitle: string;
  onPress: () => void;
  color?: string;
}

export default function MoreScreen() {
  const router = useRouter();
  const { user, logout } = useAuthStore();

  function handleLogout() {
    Alert.alert('Cerrar sesión', '¿Estás seguro que querés salir?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Salir',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/(auth)/login');
        },
      },
    ]);
  }

  const menuItems: MenuItem[] = [
    {
      icon: 'cube-outline',
      label: 'Stock',
      subtitle: 'Consultar inventario y movimientos',
      onPress: () => {},
    },
    {
      icon: 'receipt-outline',
      label: 'Compras',
      subtitle: 'Órdenes de compra y recepciones',
      onPress: () => {},
    },
    {
      icon: 'stats-chart-outline',
      label: 'Reportes',
      subtitle: 'Ventas, stock y cuentas corrientes',
      onPress: () => {},
    },
    {
      icon: 'cloud-outline',
      label: 'Sincronización',
      subtitle: 'Estado de conexión con la nube',
      onPress: () => {},
    },
    {
      icon: 'settings-outline',
      label: 'Configuración',
      subtitle: 'Servidor, notificaciones, biometría',
      onPress: () => {},
    },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(user?.name ?? 'U').charAt(0)}</Text>
        </View>
        <View>
          <Text style={styles.userName}>{user?.name ?? 'Usuario'}</Text>
          <Text style={styles.userEmail}>{user?.email ?? ''}</Text>
          <Text style={styles.userRole}>{user?.role ?? 'user'}</Text>
        </View>
      </View>

      <View style={styles.menu}>
        {menuItems.map((item) => (
          <TouchableOpacity key={item.label} style={styles.menuItem} onPress={item.onPress} activeOpacity={0.7}>
            <View style={styles.menuIcon}>
              <Ionicons name={item.icon} size={22} color={item.color ?? colors.ion[500]} />
            </View>
            <View style={styles.menuContent}>
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.ink[500]} />
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={20} color={colors.danger} />
        <Text style={styles.logoutText}>Cerrar sesión</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink[900], padding: 20 },
  profileCard: {
    backgroundColor: colors.ink[800],
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.ink[700],
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.ion[500],
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { color: colors.white, fontSize: 22, fontWeight: '700' },
  userName: { color: colors.white, fontSize: 17, fontWeight: '600' },
  userEmail: { color: colors.ink[400], fontSize: 13 },
  userRole: { color: colors.ion[400], fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginTop: 2 },
  menu: { gap: 4 },
  menuItem: {
    backgroundColor: colors.ink[800],
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.ink[700],
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.ink[700],
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  menuContent: { flex: 1 },
  menuLabel: { color: colors.white, fontSize: 15, fontWeight: '500' },
  menuSubtitle: { color: colors.ink[400], fontSize: 12, marginTop: 1 },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 32,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.3)',
  },
  logoutText: { color: colors.danger, fontSize: 15, fontWeight: '500' },
});
