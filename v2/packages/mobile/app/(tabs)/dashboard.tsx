import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { apiFetch } from '../../src/lib/api';
import { useAuthStore } from '../../src/lib/auth-store';
import { formatCurrency, formatNumber } from '../../src/lib/format';
import { colors } from '../../src/lib/colors';

interface DashboardKpis {
  totalClients: number;
  totalProducts: number;
  totalDocuments: number;
  salesThisMonth: number;
  recentDocuments: Array<{
    id: string;
    type: string;
    number: string;
    total: number;
    status: string;
    createdAt: string;
  }>;
}

export default function DashboardScreen() {
  const user = useAuthStore((s) => s.user);
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function loadData() {
    try {
      const res = await apiFetch<{ success: boolean; data: DashboardKpis }>('/dashboard');
      setKpis(res.data);
    } catch {
      setKpis({
        totalClients: 0,
        totalProducts: 0,
        totalDocuments: 0,
        salesThisMonth: 0,
        recentDocuments: [],
      });
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.ion[500]} />}
    >
      <Text style={styles.greeting}>Hola, {user?.name ?? 'usuario'}</Text>

      <View style={styles.kpiGrid}>
        <KpiCard title="Clientes" value={formatNumber(kpis?.totalClients ?? 0)} color={colors.info} />
        <KpiCard title="Productos" value={formatNumber(kpis?.totalProducts ?? 0)} color={colors.success} />
        <KpiCard title="Documentos" value={formatNumber(kpis?.totalDocuments ?? 0)} color={colors.ion[500]} />
        <KpiCard title="Ventas mes" value={formatCurrency(kpis?.salesThisMonth ?? 0)} color={colors.warning} />
      </View>

      <Text style={styles.sectionTitle}>Documentos Recientes</Text>
      {(!kpis?.recentDocuments || kpis.recentDocuments.length === 0) ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No hay documentos recientes</Text>
        </View>
      ) : (
        kpis.recentDocuments.map((doc) => (
          <View key={doc.id} style={styles.docRow}>
            <View>
              <Text style={styles.docType}>{doc.type.toUpperCase()}</Text>
              <Text style={styles.docNumber}>{doc.number}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.docTotal}>{formatCurrency(doc.total)}</Text>
              <Text style={[styles.docStatus, { color: doc.status === 'confirmed' ? colors.success : colors.ink[400] }]}>
                {doc.status}
              </Text>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

function KpiCard({ title, value, color }: { title: string; value: string; color: string }) {
  return (
    <View style={styles.kpiCard}>
      <View style={[styles.kpiDot, { backgroundColor: color }]} />
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiTitle}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink[900] },
  content: { padding: 20 },
  greeting: { color: colors.white, fontSize: 22, fontWeight: '700', marginBottom: 24 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 32 },
  kpiCard: {
    backgroundColor: colors.ink[800],
    borderRadius: 12,
    padding: 16,
    width: '47%',
    borderWidth: 1,
    borderColor: colors.ink[700],
  },
  kpiDot: { width: 8, height: 8, borderRadius: 4, marginBottom: 8 },
  kpiValue: { color: colors.white, fontSize: 20, fontWeight: '700' },
  kpiTitle: { color: colors.ink[400], fontSize: 12, marginTop: 2 },
  sectionTitle: { color: colors.white, fontSize: 16, fontWeight: '600', marginBottom: 12 },
  emptyState: {
    backgroundColor: colors.ink[800],
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
  },
  emptyText: { color: colors.ink[400], fontSize: 14 },
  docRow: {
    backgroundColor: colors.ink[800],
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.ink[700],
  },
  docType: { color: colors.ion[500], fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  docNumber: { color: colors.white, fontSize: 14, fontWeight: '500' },
  docTotal: { color: colors.white, fontSize: 16, fontWeight: '700' },
  docStatus: { fontSize: 11, marginTop: 2 },
});
