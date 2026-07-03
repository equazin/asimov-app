import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { apiFetch } from '../../src/lib/api';
import { formatCurrency } from '../../src/lib/format';
import { colors } from '../../src/lib/colors';

interface ProductResult {
  id: string;
  code: string;
  barcode: string;
  name: string;
  salePrice: number;
  unit: string;
  category: string;
  stockLevels?: Array<{ warehouseName: string; qty: number }>;
}

export default function ScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [product, setProduct] = useState<ProductResult | null>(null);
  const [scanning, setScanning] = useState(true);

  async function handleBarCodeScanned({ data }: { data: string }) {
    if (scanned) return;
    setScanned(true);
    setScanning(false);

    try {
      const res = await apiFetch<{ success: boolean; data: ProductResult }>(
        `/products/barcode/${encodeURIComponent(data)}`,
      );
      setProduct(res.data);
    } catch {
      Alert.alert('No encontrado', `Código: ${data}\nNo hay producto con este código de barras.`);
      setProduct(null);
    }
  }

  function resetScanner() {
    setScanned(false);
    setProduct(null);
    setScanning(true);
  }

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.center]}>
        <Ionicons name="camera-outline" size={48} color={colors.ink[500]} />
        <Text style={styles.permissionText}>
          Necesitamos acceso a la cámara para escanear códigos de barras
        </Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Permitir cámara</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {scanning ? (
        <CameraView
          style={styles.camera}
          barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39'] }}
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        >
          <View style={styles.overlay}>
            <View style={styles.scanFrame} />
            <Text style={styles.scanText}>Apuntá al código de barras</Text>
          </View>
        </CameraView>
      ) : product ? (
        <View style={styles.resultContainer}>
          <View style={styles.productCard}>
            <Text style={styles.productCode}>{product.code}</Text>
            <Text style={styles.productName}>{product.name}</Text>
            <Text style={styles.productCategory}>{product.category ?? 'Sin categoría'}</Text>

            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Precio de venta</Text>
              <Text style={styles.priceValue}>{formatCurrency(product.salePrice)}</Text>
            </View>

            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Unidad</Text>
              <Text style={styles.priceValue}>{product.unit}</Text>
            </View>

            {product.stockLevels && product.stockLevels.length > 0 && (
              <>
                <Text style={styles.stockTitle}>Stock por depósito</Text>
                {product.stockLevels.map((s, i) => (
                  <View key={i} style={styles.stockRow}>
                    <Text style={styles.stockWarehouse}>{s.warehouseName}</Text>
                    <Text style={[styles.stockQty, s.qty <= 0 && { color: colors.danger }]}>
                      {s.qty}
                    </Text>
                  </View>
                ))}
              </>
            )}
          </View>

          <TouchableOpacity style={styles.button} onPress={resetScanner}>
            <Ionicons name="scan-outline" size={20} color={colors.white} />
            <Text style={styles.buttonText}>Escanear otro</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={[styles.container, styles.center]}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.warning} />
          <Text style={styles.permissionText}>Producto no encontrado</Text>
          <TouchableOpacity style={styles.button} onPress={resetScanner}>
            <Text style={styles.buttonText}>Intentar de nuevo</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink[900] },
  center: { justifyContent: 'center', alignItems: 'center', padding: 32 },
  camera: { flex: 1 },
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scanFrame: {
    width: 260,
    height: 160,
    borderWidth: 2,
    borderColor: colors.ion[500],
    borderRadius: 16,
    backgroundColor: 'transparent',
  },
  scanText: { color: colors.white, fontSize: 14, marginTop: 16, fontWeight: '500' },
  permissionText: { color: colors.ink[300], fontSize: 15, textAlign: 'center', marginVertical: 16 },
  button: {
    flexDirection: 'row',
    backgroundColor: colors.ion[500],
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
  },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '600' },
  resultContainer: { flex: 1, padding: 20 },
  productCard: {
    backgroundColor: colors.ink[800],
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.ink[700],
  },
  productCode: { color: colors.ion[500], fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  productName: { color: colors.white, fontSize: 20, fontWeight: '700', marginTop: 4 },
  productCategory: { color: colors.ink[400], fontSize: 13, marginTop: 2, marginBottom: 16 },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.ink[700],
  },
  priceLabel: { color: colors.ink[400], fontSize: 14 },
  priceValue: { color: colors.white, fontSize: 16, fontWeight: '600' },
  stockTitle: { color: colors.white, fontSize: 14, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  stockRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  stockWarehouse: { color: colors.ink[300], fontSize: 13 },
  stockQty: { color: colors.white, fontSize: 14, fontWeight: '600' },
});
