-- Supabase Migration for Toko Shidqi Bangunan POS
-- Run this in Supabase Dashboard > SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. USER ROLES TABLE (extends auth.users)
-- ============================================
CREATE TABLE public.user_roles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  role text NOT NULL CHECK (role IN ('owner', 'kasir')),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Updated at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_user_roles_updated_at
  BEFORE UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- 2. SETTINGS TABLE (single row)
-- ============================================
CREATE TABLE public.settings (
  id int PRIMARY KEY DEFAULT 1,
  nama_toko text DEFAULT 'TOKO SHIDQI BANGUNAN',
  alamat_toko text DEFAULT 'Jalan H.Muh Tang Labokong',
  terapkan_pajak_struk boolean DEFAULT false,
  updated_at timestamptz DEFAULT now()
);

-- Insert default settings
INSERT INTO public.settings (id, nama_toko, alamat_toko, terapkan_pajak_struk)
VALUES (1, 'TOKO SHIDQI BANGUNAN', 'Jalan H.Muh Tang Labokong', false)
ON CONFLICT (id) DO NOTHING;

CREATE TRIGGER update_settings_updated_at
  BEFORE UPDATE ON public.settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- 3. PRODUCTS TABLE
-- ============================================
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nama text NOT NULL UNIQUE,
  kode_barcode text UNIQUE,
  supplier text,
  satuan text NOT NULL,
  harga_beli numeric(14,2),
  harga_jual numeric(14,2) NOT NULL,
  pajak_persen numeric(5,2) DEFAULT 0,
  stok numeric(10,3) DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_products_nama ON public.products(nama);
CREATE INDEX idx_products_kode_barcode ON public.products(kode_barcode);
CREATE INDEX idx_products_supplier ON public.products(supplier);

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- 4. TRANSACTIONS TABLE
-- ============================================
CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  no_struk int NOT NULL UNIQUE,
  waktu timestamptz DEFAULT now(),
  pelanggan text DEFAULT 'Umum',
  no_wa text,
  metode text NOT NULL CHECK (metode IN ('Tunai', 'Transfer', 'QRIS', 'Kredit-Hutang')),
  subtotal numeric(14,2) NOT NULL,
  diskon numeric(14,2) DEFAULT 0,
  ongkir numeric(14,2) DEFAULT 0,
  total numeric(14,2) NOT NULL,
  dibayar numeric(14,2) NOT NULL,
  hutang numeric(14,2) DEFAULT 0,
  kasir_id uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_transactions_waktu ON public.transactions(waktu DESC);
CREATE INDEX idx_transactions_kasir_id ON public.transactions(kasir_id);
CREATE INDEX idx_transactions_pelanggan ON public.transactions(pelanggan);
CREATE INDEX idx_transactions_metode ON public.transactions(metode);

-- ============================================
-- 5. TRANSACTION ITEMS TABLE
-- ============================================
CREATE TABLE public.transaction_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaksi_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  nama text NOT NULL,
  satuan text NOT NULL,
  harga_jual numeric(14,2) NOT NULL,
  harga_beli numeric(14,2),
  qty numeric(10,3) NOT NULL
);

CREATE INDEX idx_transaction_items_transaksi_id ON public.transaction_items(transaksi_id);

-- ============================================
-- 6. DEBT PAYMENTS TABLE
-- ============================================
CREATE TABLE public.debt_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pelanggan text NOT NULL,
  jumlah numeric(14,2) NOT NULL,
  waktu timestamptz DEFAULT now(),
  kasir_id uuid NOT NULL REFERENCES auth.users(id)
);

CREATE INDEX idx_debt_payments_pelanggan ON public.debt_payments(pelanggan);
CREATE INDEX idx_debt_payments_waktu ON public.debt_payments(waktu DESC);

-- ============================================
-- 7. RPC FUNCTIONS (SECURITY DEFINER)
-- ============================================

-- 7.1 get_next_struk_number
CREATE OR REPLACE FUNCTION public.get_next_struk_number()
RETURNS int LANGUAGE sql STABLE AS $$
  SELECT COALESCE(MAX(no_struk), 0) + 1 FROM public.transactions;
$$;

-- 7.2 adjust_stock (atomic increment/decrement)
CREATE OR REPLACE FUNCTION public.adjust_stock(p_product_id uuid, p_delta numeric)
RETURNS public.products LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_product public.products;
BEGIN
  UPDATE public.products
  SET stok = GREATEST(stok + p_delta, 0), updated_at = now()
  WHERE id = p_product_id
  RETURNING * INTO v_product;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produk tidak ditemukan';
  END IF;
  
  RETURN v_product;
END;
$$;

-- 7.3 checkout (ATOMIC: transaction + items + stock decrement)
CREATE OR REPLACE FUNCTION public.checkout(
  p_items jsonb,
  p_pelanggan text,
  p_no_wa text,
  p_metode text,
  p_subtotal numeric,
  p_diskon numeric,
  p_ongkir numeric,
  p_total numeric,
  p_dibayar numeric,
  p_hutang numeric,
  p_kasir_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_no_struk int;
  v_tx_id uuid;
  v_item_count int;
  v_stock_ok int;
BEGIN
  -- Get next struk number
  SELECT COALESCE(MAX(no_struk), 0) + 1 INTO v_no_struk FROM public.transactions;
  
  -- Insert transaction
  INSERT INTO public.transactions (no_struk, pelanggan, no_wa, metode, subtotal, diskon, ongkir, total, dibayar, hutang, kasir_id)
  VALUES (v_no_struk, p_pelanggan, p_no_wa, p_metode, p_subtotal, p_diskon, p_ongkir, p_total, p_dibayar, p_hutang, p_kasir_id)
  RETURNING id INTO v_tx_id;
  
  -- Count items
  SELECT jsonb_array_length(p_items) INTO v_item_count;
  
  -- Insert items
  INSERT INTO public.transaction_items (transaksi_id, nama, satuan, harga_jual, harga_beli, qty)
  SELECT v_tx_id, item->>'nama', item->>'satuan', (item->>'harga_jual')::numeric, 
         (item->>'harga_beli')::numeric, (item->>'qty')::numeric
  FROM jsonb_array_elements(p_items) item;
  
  -- Decrement stock atomically with check
  UPDATE public.products p
  SET stok = p.stok - ti.qty, updated_at = now()
  FROM (
    SELECT (item->>'nama')::text as nama, (item->>'qty')::numeric as qty
    FROM jsonb_array_elements(p_items) item
  ) ti
  WHERE p.nama = ti.nama AND p.stok >= ti.qty;
  
  -- Verify all items had sufficient stock
  GET DIAGNOSTICS v_stock_ok = ROW_COUNT;
  
  IF v_stock_ok < v_item_count THEN
    RAISE EXCEPTION 'Stok tidak mencukupi untuk satu atau lebih barang';
  END IF;
  
  RETURN jsonb_build_object(
    'transaction', (SELECT to_jsonb(t) FROM public.transactions t WHERE t.id = v_tx_id),
    'no_struk', v_no_struk
  );
END;
$$;

-- 7.4 get_debt_summary
CREATE OR REPLACE FUNCTION public.get_debt_summary()
RETURNS TABLE (
  pelanggan text,
  total_hutang numeric,
  sudah_bayar numeric,
  sisa numeric,
  status text
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  WITH hutang_agg AS (
    SELECT 
      pelanggan,
      SUM(hutang) as total_hutang
    FROM public.transactions
    WHERE hutang > 0
    GROUP BY pelanggan
  ),
  bayar_agg AS (
    SELECT 
      pelanggan,
      COALESCE(SUM(jumlah), 0) as sudah_bayar
    FROM public.debt_payments
    GROUP BY pelanggan
  )
  SELECT 
    h.pelanggan,
    h.total_hutang,
    COALESCE(b.sudah_bayar, 0),
    GREATEST(h.total_hutang - COALESCE(b.sudah_bayar, 0), 0),
    CASE WHEN GREATEST(h.total_hutang - COALESCE(b.sudah_bayar, 0), 0) = 0 THEN 'LUNAS' ELSE 'BELUM LUNAS' END
  FROM hutang_agg h
  LEFT JOIN bayar_agg b ON LOWER(h.pelanggan) = LOWER(b.pelanggan)
  ORDER BY GREATEST(h.total_hutang - COALESCE(b.sudah_bayar, 0), 0) DESC;
END;
$$;

-- 7.5 get_total_outstanding_debt
CREATE OR REPLACE FUNCTION public.get_total_outstanding_debt()
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_total numeric;
BEGIN
  SELECT COALESCE(SUM(GREATEST(total_hutang - COALESCE(sudah_bayar, 0), 0)), 0) INTO v_total
  FROM (
    SELECT 
      h.pelanggan,
      h.total_hutang,
      COALESCE(b.sudah_bayar, 0) as sudah_bayar
    FROM (
      SELECT pelanggan, SUM(hutang) as total_hutang
      FROM public.transactions
      WHERE hutang > 0
      GROUP BY pelanggan
    ) h
    LEFT JOIN (
      SELECT pelanggan, SUM(jumlah) as sudah_bayar
      FROM public.debt_payments
      GROUP BY pelanggan
    ) b ON LOWER(h.pelanggan) = LOWER(b.pelanggan)
  ) sub;
  RETURN v_total;
END;
$$;

-- 7.6 get_report_summary
CREATE OR REPLACE FUNCTION public.get_report_summary(p_from_date date, p_to_date date)
RETURNS TABLE (
  jumlah_transaksi bigint,
  omzet numeric,
  penjualan_kredit numeric,
  pembayaran_hutang numeric,
  total_kas_masuk numeric,
  diskon_ongkir numeric,
  laba_kotor numeric
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  WITH tx_data AS (
    SELECT 
      COUNT(*) as jumlah_transaksi,
      COALESCE(SUM(total), 0) as omzet,
      COALESCE(SUM(CASE WHEN metode = 'Kredit-Hutang' THEN total ELSE 0 END), 0) as penjualan_kredit,
      COALESCE(SUM(diskon + ongkir), 0) as diskon_ongkir,
      COALESCE(SUM(
        (ti.harga_jual - COALESCE(ti.harga_beli, 0)) * ti.qty
      ), 0) as laba_kotor
    FROM public.transactions t
    JOIN public.transaction_items ti ON ti.transaksi_id = t.id
    WHERE t.waktu::date BETWEEN p_from_date AND p_to_date
  ),
  bayar_data AS (
    SELECT COALESCE(SUM(jumlah), 0) as pembayaran_hutang
    FROM public.debt_payments
    WHERE waktu::date BETWEEN p_from_date AND p_to_date
  )
  SELECT 
    tx.jumlah_transaksi,
    tx.omzet,
    tx.penjualan_kredit,
    b.pembayaran_hutang,
    tx.omzet - tx.penjualan_kredit + b.pembayaran_hutang as total_kas_masuk,
    tx.diskon_ongkir,
    tx.laba_kotor
  FROM tx_data tx, bayar_data b;
END;
$$;

-- 7.7 get_daily_sales
CREATE OR REPLACE FUNCTION public.get_daily_sales(p_from_date date, p_to_date date)
RETURNS TABLE (
  tanggal date,
  omzet numeric,
  transaksi bigint
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.waktu::date as tanggal,
    COALESCE(SUM(t.total), 0) as omzet,
    COUNT(*) as transaksi
  FROM public.transactions t
  WHERE t.waktu::date BETWEEN p_from_date AND p_to_date
  GROUP BY t.waktu::date
  ORDER BY t.waktu::date;
END;
$$;

-- 7.8 get_payment_method_sales
CREATE OR REPLACE FUNCTION public.get_payment_method_sales(p_from_date date, p_to_date date)
RETURNS TABLE (
  metode text,
  total numeric,
  count bigint
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.metode,
    COALESCE(SUM(t.total), 0) as total,
    COUNT(*) as count
  FROM public.transactions t
  WHERE t.waktu::date BETWEEN p_from_date AND p_to_date
  GROUP BY t.metode
  ORDER BY total DESC;
END;
$$;

-- 7.9 get_top_products
CREATE OR REPLACE FUNCTION public.get_top_products(p_from_date date, p_to_date date)
RETURNS TABLE (
  nama text,
  satuan text,
  qty numeric,
  nilai numeric
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ti.nama,
    ti.satuan,
    COALESCE(SUM(ti.qty), 0) as qty,
    COALESCE(SUM(ti.harga_jual * ti.qty), 0) as nilai
  FROM public.transaction_items ti
  JOIN public.transactions t ON t.id = ti.transaksi_id
  WHERE t.waktu::date BETWEEN p_from_date AND p_to_date
  GROUP BY ti.nama, ti.satuan
  ORDER BY nilai DESC;
END;
$$;

-- 7.10 get_low_stock
CREATE OR REPLACE FUNCTION public.get_low_stock()
RETURNS TABLE (
  id uuid,
  nama text,
  supplier text,
  satuan text,
  harga_jual numeric,
  stok numeric,
  nilai_stok numeric,
  status text
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.nama,
    p.supplier,
    p.satuan,
    p.harga_jual,
    p.stok,
    p.harga_jual * p.stok as nilai_stok,
    CASE 
      WHEN p.stok <= 0 THEN 'Habis'
      WHEN p.stok <= 10 THEN 'Menipis'
      ELSE 'Aman'
    END as status
  FROM public.products p
  WHERE p.stok <= 10
  ORDER BY p.stok ASC;
END;
$$;

-- 7.11 reset_all_data (truncate all tables, reseed)
CREATE OR REPLACE FUNCTION public.reset_all_data()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Disable triggers temporarily
  ALTER TABLE public.transaction_items DISABLE TRIGGER ALL;
  ALTER TABLE public.transactions DISABLE TRIGGER ALL;
  ALTER TABLE public.products DISABLE TRIGGER ALL;
  ALTER TABLE public.debt_payments DISABLE TRIGGER ALL;
  ALTER TABLE public.user_roles DISABLE TRIGGER ALL;
  ALTER TABLE public.settings DISABLE TRIGGER ALL;
  
  -- Truncate in order (FK constraints)
  TRUNCATE public.transaction_items, public.transactions, public.debt_payments RESTART IDENTITY CASCADE;
  
  -- Reset products to seed data
  TRUNCATE public.products RESTART IDENTITY CASCADE;
  
  -- Reset settings to default
  TRUNCATE public.settings RESTART IDENTITY CASCADE;
  
  -- Keep user_roles (don't delete auth users)
  -- But deactivate all except current user
  -- Note: Current user detection would need session context
  
  -- Re-enable triggers
  ALTER TABLE public.transaction_items ENABLE TRIGGER ALL;
  ALTER TABLE public.transactions ENABLE TRIGGER ALL;
  ALTER TABLE public.products ENABLE TRIGGER ALL;
  ALTER TABLE public.debt_payments ENABLE TRIGGER ALL;
  ALTER TABLE public.user_roles ENABLE TRIGGER ALL;
  ALTER TABLE public.settings ENABLE TRIGGER ALL;
  
  -- Reseed settings
  INSERT INTO public.settings (id, nama_toko, alamat_toko, terapkan_pajak_struk)
  VALUES (1, 'TOKO SHIDQI BANGUNAN', 'Jalan H.Muh Tang Labokong', false);
  
  -- Reseed 20 sample products
  INSERT INTO public.products (nama, kode_barcode, supplier, satuan, harga_beli, harga_jual, pajak_persen, stok) VALUES
    ('Semen Tiga Roda 50kg', '8991234560012', 'Tiga Roda', 'sak', 60000, 68000, 10, 100),
    ('Semen Gresik 40kg', '8991234560029', 'Gresik', 'sak', 48000, 55000, 10, 100),
    ('Pasir Pasang', '8991234560036', 'Local', 'm³', 200000, 250000, 10, 20),
    ('Pasir Cor', '8991234560043', 'Local', 'm³', 230000, 280000, 10, 20),
    ('Batu Split 1/2', '8991234560050', 'Local', 'm³', 270000, 320000, 10, 15),
    ('Batu Bata Merah', '8991234560067', 'Local', 'biji', 700, 900, 10, 5000),
    ('Bata Ringan 60x20x10', '8991234560074', 'Local', 'biji', 9000, 11500, 10, 2000),
    ('Besi Beton 10mm SNI', '8991234560081', 'SNI', 'batang', 68000, 78000, 10, 200),
    ('Besi Beton 8mm SNI', '8991234560098', 'SNI', 'batang', 45000, 52000, 10, 300),
    ('Kawat Bendrat', '8991234560104', 'Bendrat', 'kg', 18000, 22000, 10, 100),
    ('Paku 2"', '8991234560111', 'Local', 'kg', 16000, 20000, 10, 100),
    ('Paku 4"', '8991234560128', 'Local', 'kg', 15000, 19000, 10, 100),
    ('Triplek 9mm', '8991234560135', 'Local', 'lembar', 95000, 115000, 10, 50),
    ('Kayu Kaso 5/7', '8991234560142', 'Local', 'batang', 40000, 48000, 10, 100),
    ('Cat Tembok Dulux 5kg', '8991234560159', 'Dulux', 'kaleng', 150000, 185000, 10, 30),
    ('Cat Kayu & Besi 1kg', '8991234560166', 'Local', 'kaleng', 50000, 62000, 10, 50),
    ('Pipa PVC 3" Rucika', '8991234560173', 'Rucika', 'batang', 80000, 95000, 10, 50),
    ('Lem PVC', '8991234560180', 'Local', 'kaleng', 14000, 18000, 10, 100),
    ('Keramik 40x40', '8991234560197', 'Local', 'dus', 60000, 72000, 10, 50),
    ('Seng Gelombang BJLS 0.30', '8991234560203', 'BJLS', 'lembar', 70000, 85000, 10, 50);
END;
$$;

-- ============================================
-- 8. ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debt_payments ENABLE ROW LEVEL SECURITY;

-- Helper: is_owner()
CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'owner' AND is_active = true
  );
$$;

-- Helper: is_kasir()
CREATE OR REPLACE FUNCTION public.is_kasir()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'kasir' AND is_active = true
  );
$$;

-- Helper: is_owner_or_kasir()
CREATE OR REPLACE FUNCTION public.is_owner_or_kasir()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND is_active = true
  );
$$;

-- USER_ROLES policies
CREATE POLICY "Owner full access user_roles" ON public.user_roles
  FOR ALL USING (public.is_owner());

CREATE POLICY "Kasir read own user_roles" ON public.user_roles
  FOR SELECT USING (user_id = auth.uid());

-- SETTINGS policies
CREATE POLICY "Owner full access settings" ON public.settings
  FOR ALL USING (public.is_owner());

CREATE POLICY "Kasir read settings" ON public.settings
  FOR SELECT USING (public.is_kasir());

-- PRODUCTS policies
CREATE POLICY "Owner full access products" ON public.products
  FOR ALL USING (public.is_owner());

CREATE POLICY "Kasir read products (stok > 0)" ON public.products
  FOR SELECT USING (public.is_kasir() AND stok > 0);

CREATE POLICY "Kasir read all products (for search)" ON public.products
  FOR SELECT USING (public.is_kasir());

-- TRANSACTIONS policies
CREATE POLICY "Owner full access transactions" ON public.transactions
  FOR ALL USING (public.is_owner());

CREATE POLICY "Kasir insert transactions" ON public.transactions
  FOR INSERT WITH CHECK (public.is_kasir() AND kasir_id = auth.uid());

CREATE POLICY "Kasir read own transactions" ON public.transactions
  FOR SELECT USING (public.is_kasir() AND kasir_id = auth.uid());

-- TRANSACTION_ITEMS policies
CREATE POLICY "Owner full access transaction_items" ON public.transaction_items
  FOR ALL USING (public.is_owner());

CREATE POLICY "Kasir insert transaction_items (via checkout)" ON public.transaction_items
  FOR INSERT WITH CHECK (
    public.is_kasir() AND 
    EXISTS (SELECT 1 FROM public.transactions WHERE id = transaksi_id AND kasir_id = auth.uid())
  );

-- DEBT_PAYMENTS policies
CREATE POLICY "Owner full access debt_payments" ON public.debt_payments
  FOR ALL USING (public.is_owner());

CREATE POLICY "Kasir insert debt_payments" ON public.debt_payments
  FOR INSERT WITH CHECK (public.is_kasir() AND kasir_id = auth.uid());

CREATE POLICY "Kasir read debt_payments" ON public.debt_payments
  FOR SELECT USING (public.is_kasir());

-- ============================================
-- 9. REALTIME PUBLICATION
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.transaction_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.debt_payments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_roles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.settings;

-- ============================================
-- 10. GRANT PERMISSIONS
-- ============================================
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON public.user_roles TO authenticated;
GRANT ALL ON public.settings TO authenticated;
GRANT ALL ON public.products TO authenticated;
GRANT ALL ON public.transactions TO authenticated;
GRANT ALL ON public.transaction_items TO authenticated;
GRANT ALL ON public.debt_payments TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_struk_number TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_stock TO authenticated;
GRANT EXECUTE ON FUNCTION public.checkout TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_debt_summary TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_total_outstanding_debt TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_report_summary TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_sales TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_payment_method_sales TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_top_products TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_low_stock TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_all_data TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_owner TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_kasir TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_owner_or_kasir TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column TO authenticated;

-- ============================================
-- END OF MIGRATION
-- ============================================