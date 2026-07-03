import { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiFetch } from '../../src/lib/api';
import { formatCurrency, formatDate } from '../../src/lib/format';
import { colors } from '../../src/lib/colors';

interface SaleDoc {
  id: string;
  type: string;
  number: string;
  total: number;
  status: string;
  createdAt: string;
  client?: { businessName: string };
}

export default function SalesScreen() {
  const [docs, setDocs] = useState<SaleDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  async function loadDocs() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ type: 'invoice' });
      if (search) params.set('search', search);
      const res = await apiFetch<{ success: boolean; data: SaleDoc[] }>(`/documents?${params}`);
      setDocs(res.data);
    } catch {
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDocs();
  }, [search]);

  const typeLabels: Record<string, string> = {
    invoice: 'Factura',
    quote: 'Presupuesto',
    sale_order: 'Pedido',
    delivery_note: 'Remito',
    receipt: 'Recibo',
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color={colors.ink[400]} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por número o cliente..."
          placeholderTextColor={colors.ink[400]}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <FlatList
        data={docs}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="document-outline" size={40} color={colors.ink[600]} />
            <Text style={styles.emptyText}>
              {loading ? 'Cargando...' : 'No hay documentos'}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.docCard} activeOpacity={0.7}>
            <View style={styles.docHeader}>
              <Text style={styles.docType}>{typeLabels[item.type] ?? item.type}</Text>
              <Text style={styles.docNumber}>{item.number}</Text>
            </View>
            <Text style={styles.docClient}>{item.client?.businessName ?? 'Sin cliente'}</Text>
            <View style={styles.docFooter}>
              <Text style={styles.docDate}>{formatDate(item.createdAt)}</Text>
              <Text style={styles.docTotal}>{formatCurrency(item.total)}</Text>
            </View>
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
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, paddingVertical: 12, color: colors.white, fontSize: 14 },
  list: { paddingHorizontal: 16, paddingBottom: 20 },
  docCard: {
    backgroundColor: colors.ink[800],
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.ink[700],
  },
  docHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  docType: { color: colors.ion[500], fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  docNumber: { color: colors.ink[300], fontSize: 12 },
  docClient: { color: colors.white, fontSize: 15, fontWeight: '500', marginBottom: 8 },
  docFooter: { flexDirection: 'row', justifyContent: 'space-between' },
  docDate: { color: colors.ink[400], fontSize: 12 },
  docTotal: { color: colors.white, fontSize: 16, fontWeight: '700' },
  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyText: { color: colors.ink[400], fontSize: 14, marginTop: 8 },
});
