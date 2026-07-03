import { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, TextInput, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiFetch } from '../../src/lib/api';
import { colors } from '../../src/lib/colors';

interface ClientRow {
  id: string;
  code: string;
  businessName: string;
  cuit: string;
  email: string;
  phone: string;
  city: string;
  province: string;
}

export default function ClientsScreen() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const loadClients = useCallback(async () => {
    setLoading(true);
    try {
      const params = search ? `?search=${encodeURIComponent(search)}` : '';
      const res = await apiFetch<{ success: boolean; data: ClientRow[] }>(`/clients${params}`);
      setClients(res.data);
    } catch {
      setClients([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color={colors.ink[400]} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por nombre, CUIT..."
          placeholderTextColor={colors.ink[400]}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <FlatList
        data={clients}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={loadClients} tintColor={colors.ion[500]} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={40} color={colors.ink[600]} />
            <Text style={styles.emptyText}>
              {loading ? 'Cargando...' : 'No hay clientes'}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.clientCard} activeOpacity={0.7}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{item.businessName.charAt(0)}</Text>
            </View>
            <View style={styles.clientInfo}>
              <Text style={styles.clientName}>{item.businessName}</Text>
              <Text style={styles.clientDetail}>
                {item.cuit} {item.city ? `· ${item.city}` : ''}
              </Text>
              {item.phone ? (
                <Text style={styles.clientContact}>
                  <Ionicons name="call-outline" size={11} color={colors.ink[400]} /> {item.phone}
                </Text>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.ink[500]} />
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink[900] },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.ink[800],
    margin: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.ink[700],
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, paddingVertical: 12, color: colors.white, fontSize: 14 },
  list: { paddingHorizontal: 16, paddingBottom: 20 },
  clientCard: {
    backgroundColor: colors.ink[800],
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.ink[700],
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.ion[600],
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: { color: colors.white, fontSize: 16, fontWeight: '700' },
  clientInfo: { flex: 1 },
  clientName: { color: colors.white, fontSize: 15, fontWeight: '600' },
  clientDetail: { color: colors.ink[400], fontSize: 12, marginTop: 2 },
  clientContact: { color: colors.ink[300], fontSize: 11, marginTop: 2 },
  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyText: { color: colors.ink[400], fontSize: 14, marginTop: 8 },
});
