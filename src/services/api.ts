import { supabase } from '@/lib/supabase';
import { Product, Transaction, TransactionItem, DebtPayment, DebtSummary, StockStatus, ReportSummary, DailySales, PaymentMethodSales, TopProduct } from '@/types';
import { formatDateInput } from '@/utils/format';

export const productService = {
  async getAll(): Promise<Product[]> {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('nama');
    if (error) throw error;
    return data || [];
  },

  async getActive(): Promise<Product[]> {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .gt('stok', 0)
      .order('nama');
    if (error) throw error;
    return data || [];
  },

  async getById(id: string): Promise<Product | null> {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  },

  async getByBarcode(kode: string): Promise<Product | null> {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('kode_barcode', kode)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async create(product: Omit<Product, 'id' | 'created_at' | 'updated_at'>): Promise<Product> {
    const { data, error } = await supabase
      .from('products')
      .insert({ ...product, stok: product.stok || 0 })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id: string, updates: Partial<Product>): Promise<Product> {
    const { data, error } = await supabase
      .from('products')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) throw error;
  },

  async adjustStock(id: string, delta: number): Promise<Product> {
    const { data, error } = await supabase.rpc('adjust_stock', { product_id: id, delta });
    if (error) throw error;
    return data;
  },

  async setStock(id: string, stok: number): Promise<Product> {
    const { data, error } = await supabase
      .from('products')
      .update({ stok, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async getSuppliers(): Promise<string[]> {
    const { data, error } = await supabase
      .from('products')
      .select('supplier')
      .not('supplier', 'is', null);
    if (error) throw error;
    const suppliers = [...new Set(data?.map(d => d.supplier).filter(Boolean) || [])];
    return suppliers.sort();
  },

  subscribe(callback: (payload: any) => void) {
    return supabase
      .channel('products_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, callback)
      .subscribe();
  },
};

export const transactionService = {
  async getAll(filters?: { from?: string; to?: string; search?: string }): Promise<Transaction[]> {
    let query = supabase
      .from('transactions')
      .select('*, items:transaction_items(*)')
      .order('waktu', { ascending: false });

    if (filters?.from) query = query.gte('waktu', filters.from);
    if (filters?.to) query = query.lte('waktu', filters.to + 'T23:59:59');
    if (filters?.search) {
      query = query.or(`pelanggan.ilike.%${filters.search}%,no_struk::text.ilike.%${filters.search}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async getById(id: string): Promise<Transaction | null> {
    const { data, error } = await supabase
      .from('transactions')
      .select('*, items:transaction_items(*)')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  },

  async checkout(params: {
    items: Omit<TransactionItem, 'id' | 'transaksi_id'>[];
    pelanggan: string;
    no_wa?: string;
    metode: Transaction['metode'];
    subtotal: number;
    diskon: number;
    ongkir: number;
    total: number;
    dibayar: number;
    hutang: number;
    kasir_id: string;
  }): Promise<{ transaction: Transaction; no_struk: number }> {
    const { data, error } = await supabase.rpc('checkout', params);
    if (error) throw error;
    return data;
  },

  async getNextStrukNumber(): Promise<number> {
    const { data, error } = await supabase.rpc('get_next_struk_number');
    if (error) throw error;
    return data || 1;
  },

  subscribe(callback: (payload: any) => void) {
    return supabase
      .channel('transactions_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, callback)
      .subscribe();
  },
};

export const debtService = {
  async getSummary(): Promise<DebtSummary[]> {
    const { data, error } = await supabase.rpc('get_debt_summary');
    if (error) throw error;
    return data || [];
  },

  async getPayments(pelanggan?: string): Promise<DebtPayment[]> {
    let query = supabase
      .from('debt_payments')
      .select('*')
      .order('waktu', { ascending: false });
    if (pelanggan) query = query.ilike('pelanggan', pelanggan);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async addPayment(payment: Omit<DebtPayment, 'id' | 'waktu' | 'kasir_nama'>): Promise<DebtPayment> {
    const { data, error } = await supabase
      .from('debt_payments')
      .insert(payment)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async getTotalOutstanding(): Promise<number> {
    const { data, error } = await supabase.rpc('get_total_outstanding_debt');
    if (error) throw error;
    return data || 0;
  },
};

export const reportService = {
  async getSummary(from: string, to: string): Promise<ReportSummary> {
    const { data, error } = await supabase.rpc('get_report_summary', { from_date: from, to_date: to });
    if (error) throw error;
    return data || {
      jumlah_transaksi: 0,
      omzet: 0,
      penjualan_kredit: 0,
      pembayaran_hutang: 0,
      total_kas_masuk: 0,
      diskon_ongkir: 0,
      laba_kotor: 0,
    };
  },

  async getDailySales(from: string, to: string): Promise<DailySales[]> {
    const { data, error } = await supabase.rpc('get_daily_sales', { from_date: from, to_date: to });
    if (error) throw error;
    return data || [];
  },

  async getPaymentMethodSales(from: string, to: string): Promise<PaymentMethodSales[]> {
    const { data, error } = await supabase.rpc('get_payment_method_sales', { from_date: from, to_date: to });
    if (error) throw error;
    return data || [];
  },

  async getTopProducts(from: string, to: string): Promise<TopProduct[]> {
    const { data, error } = await supabase.rpc('get_top_products', { from_date: from, to_date: to });
    if (error) throw error;
    return data || [];
  },

  async getLowStock(): Promise<StockStatus[]> {
    const { data, error } = await supabase.rpc('get_low_stock');
    if (error) throw error;
    return data || [];
  },
};

export const settingsService = {
  async get(): Promise<any> {
    const { data, error } = await supabase.from('settings').select('*').limit(1).single();
    if (error) throw error;
    return data;
  },

  async update(settings: any): Promise<any> {
    const { data, error } = await supabase.from('settings').upsert(settings).select().single();
    if (error) throw error;
    return data;
  },
};

export const userService = {
  async getAll(): Promise<any[]> {
    const { data, error } = await supabase.from('user_roles').select('*').order('created_at');
    if (error) throw error;
    return data || [];
  },

  async create(user: { email: string; password: string; full_name: string; role: 'owner' | 'kasir' }): Promise<any> {
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
    });
    if (authError) throw authError;

    const { data, error } = await supabase.from('user_roles').insert({
      user_id: authData.user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      is_active: true,
    }).select().single();
    if (error) throw error;
    return data;
  },

  async update(id: string, updates: { full_name?: string; role?: 'owner' | 'kasir'; is_active?: boolean }): Promise<any> {
    const { data, error } = await supabase.from('user_roles').update(updates).eq('user_id', id).select().single();
    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    await supabase.auth.admin.deleteUser(id);
    const { error } = await supabase.from('user_roles').delete().eq('user_id', id);
    if (error) throw error;
  },
};