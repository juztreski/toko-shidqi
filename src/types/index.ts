export interface User {
  id: string;
  email: string;
  full_name?: string;
  role: 'owner' | 'kasir';
  is_active: boolean;
  created_at: string;
}

export interface Product {
  id: string;
  nama: string;
  kode_barcode?: string;
  supplier?: string;
  satuan: string;
  harga_beli?: number;
  harga_jual: number;
  pajak_persen: number;
  stok: number;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  no_struk: number;
  waktu: string;
  pelanggan: string;
  no_wa?: string;
  metode: 'Tunai' | 'Transfer' | 'QRIS' | 'Kredit-Hutang';
  subtotal: number;
  diskon: number;
  ongkir: number;
  total: number;
  dibayar: number;
  hutang: number;
  kasir_id: string;
  kasir_nama?: string;
  items?: TransactionItem[];
}

export interface TransactionItem {
  id?: string;
  transaksi_id: string;
  nama: string;
  satuan: string;
  harga_jual: number;
  harga_beli?: number;
  qty: number;
}

export interface DebtPayment {
  id: string;
  pelanggan: string;
  jumlah: number;
  waktu: string;
  kasir_id: string;
  kasir_nama?: string;
}

export interface DebtSummary {
  pelanggan: string;
  total_hutang: number;
  sudah_bayar: number;
  sisa: number;
  status: 'LUNAS' | 'BELUM LUNAS';
}

export interface CartItem {
  product: Product;
  qty: number;
}

export interface StoreSettings {
  nama_toko: string;
  alamat_toko: string;
  terapkan_pajak_struk: boolean;
}

export interface ReportSummary {
  jumlah_transaksi: number;
  omzet: number;
  penjualan_kredit: number;
  pembayaran_hutang: number;
  total_kas_masuk: number;
  diskon_ongkir: number;
  laba_kotor: number;
}

export interface DailySales {
  tanggal: string;
  omzet: number;
  transaksi: number;
}

export interface PaymentMethodSales {
  metode: string;
  total: number;
  count: number;
}

export interface TopProduct {
  nama: string;
  satuan: string;
  qty: number;
  nilai: number;
}

export interface StockStatus {
  id: string;
  nama: string;
  supplier?: string;
  satuan: string;
  harga_jual: number;
  stok: number;
  nilai_stok: number;
  status: 'Aman' | 'Menipis' | 'Habis';
}

export interface ImportResult {
  baru: number;
  diperbarui: number;
  dilewati: number;
  errors: { row: number; reason: string }[];
  preview: Product[];
}