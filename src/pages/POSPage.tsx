import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { productService, transactionService } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { Product, CartItem, Transaction } from '@/types';
import { formatRupiah, formatRupiahShort, normalizePhone, generateWhatsAppLink, generateStructText, generateReceiptHtml, cn } from '@/utils/format';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select } from '@/components/ui/Select';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/Dialog';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableFooter } from '@/components/ui/Table';
import { Separator } from '@/components/ui/Separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/RadioGroup';
import { Switch } from '@/components/ui/Switch';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { Checkbox } from '@/components/ui/Checkbox';
import { Plus, Minus, Trash2, Camera, Search, Barcode, Package, Truck, CreditCard, Smartphone, QrCode, Banknote, Send, Copy, Printer, Check, X, AlertCircle, Info, Loader2 } from 'lucide-react';
import { useScanner } from '@/hooks/useScanner';
import { useBarcodeKeyboard } from '@/hooks/useBarcodeKeyboard';
import { toast } from 'sonner';

const PAYMENT_METHODS = [
  { value: 'Tunai', label: 'Tunai', icon: Banknote },
  { value: 'Transfer', label: 'Transfer', icon: Smartphone },
  { value: 'QRIS', label: 'QRIS', icon: QrCode },
  { value: 'Kredit-Hutang', label: 'Kredit/Hutang', icon: CreditCard },
] as const;

export const POSPage = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState('Umum');
  const [customerPhone, setCustomerPhone] = useState('');
  const [discount, setDiscount] = useState(0);
  const [shipping, setShipping] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<'Tunai' | 'Transfer' | 'QRIS' | 'Kredit-Hutang'>('Tunai');
  const [receivedAmount, setReceivedAmount] = useState(0);
  const [showScanner, setShowScanner] = useState(false);
  const [scannedCodes, setScannedCodes] = useState<Set<string>>(new Set());
  const [lastScanTime, setLastScanTime] = useState<Map<string, number>>(new Map());
  const [showReceipt, setShowReceipt] = useState(false);
  const [lastTransaction, setLastTransaction] = useState<Transaction | null>(null);
  const [settings, setSettings] = useState({ nama_toko: 'TOKO SHIDQI BANGUNAN', alamat_toko: 'Jalan H.Muh Tang Labokong', terapkan_pajak_struk: false });
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [keyboardBuffer, setKeyboardBuffer] = useState('');

  // Fetch products
  const { data: products = [], isLoading, refetch } = useQuery({
    queryKey: ['products'],
    queryFn: productService.getActive,
  });

  // Fetch settings
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const { data } = await supabase.from('settings').select('*').limit(1).single();
        if (data) setSettings(data);
      } catch {}
    };
    fetchSettings();
  }, []);

  // Barcode scanner hook
  const { startScanner, stopScanner, lastScanned } = useScanner({
    onScan: handleBarcodeScan,
    paused: !showScanner,
  });

  // Keyboard barcode listener
  useBarcodeKeyboard({
    onBarcode: handleBarcodeScan,
    active: true,
  });

  // Filter products
  const filteredProducts = products.filter(p => {
    const q = search.toLowerCase();
    return p.nama.toLowerCase().includes(q) || 
           p.kode_barcode?.toLowerCase().includes(q) || 
           p.supplier?.toLowerCase().includes(q);
  });

  // Calculations
  const subtotal = cart.reduce((sum, item) => sum + item.product.harga_jual * item.qty, 0);
  const total = Math.max(0, subtotal - discount + shipping);
  const change = paymentMethod === 'Tunai' ? Math.max(0, receivedAmount - total) : 0;
  const debt = paymentMethod === 'Kredit-Hutang' ? total - receivedAmount : 0;
  const isCredit = paymentMethod === 'Kredit-Hutang';
  const canPay = cart.length > 0 && 
    (paymentMethod !== 'Tunai' || receivedAmount >= total) &&
    (isCredit ? customerName.trim() !== '' && customerName !== 'Umum' : true);

  // Handle barcode scan
  function handleBarcodeScan(code: string) {
    const now = Date.now();
    const lastTime = lastScanTime.get(code) || 0;
    if (now - lastTime < 2000) return; // Debounce 2 seconds
    
    setLastScanTime(prev => new Map(prev).set(code, now));
    
    const product = products.find(p => p.kode_barcode === code);
    if (product) {
      if (product.stok <= 0) {
        toast.error(`Stok ${product.nama} habis`);
        return;
      }
      addToCart(product);
      toast.success(`✓ ${product.nama} ditambahkan`);
    } else {
      toast.error(`Kode ${code} belum terdaftar`, {
        action: {
          label: 'Daftarkan',
          onClick: () => navigateToProductWithCode(code),
        },
      });
    }
  }

  function navigateToProductWithCode(code: string) {
    // Navigate to products page with code pre-filled
    window.location.href = `/barang?kode=${encodeURIComponent(code)}`;
  }

  // Add to cart
  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        if (existing.qty >= product.stok) {
          toast.error('Stok tidak mencukupi');
          return prev;
        }
        return prev.map(item => 
          item.product.id === product.id 
            ? { ...item, qty: item.qty + (product.satuan === 'kg' || product.satuan === 'm³' ? 0.5 : 1) }
            : item
        );
      }
      return [...prev, { product, qty: product.satuan === 'kg' || product.satuan === 'm³' ? 0.5 : 1 }];
    });
    setSearch('');
    searchInputRef.current?.focus();
  };

  // Update quantity
  const updateQty = (productId: string, qty: number) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    if (qty <= 0) {
      removeFromCart(productId);
      return;
    }
    if (qty > product.stok) {
      toast.error(`Stok maksimal: ${product.stok} ${product.satuan}`);
      return;
    }
    setCart(prev => prev.map(item => 
      item.product.id === productId ? { ...item, qty } : item
    ));
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  };

  const clearCart = () => {
    setCart([]);
    setCustomerName('Umum');
    setCustomerPhone('');
    setDiscount(0);
    setShipping(0);
    setPaymentMethod('Tunai');
    setReceivedAmount(0);
  };

  // Checkout mutation
  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const items = cart.map(item => ({
        nama: item.product.nama,
        satuan: item.product.satuan,
        harga_jual: item.product.harga_jual,
        harga_beli: item.product.harga_beli,
        qty: item.qty,
      }));

      return transactionService.checkout({
        items,
        pelanggan: customerName,
        no_wa: customerPhone || undefined,
        metode: paymentMethod,
        subtotal,
        diskon: discount,
        ongkir: shipping,
        total,
        dibayar: isCredit ? receivedAmount : total,
        hutang: debt,
        kasir_id: user!.id,
      });
    },
    onSuccess: (result) => {
      const transactionItems = cart.map(item => ({
        nama: item.product.nama,
        satuan: item.product.satuan,
        harga_jual: item.product.harga_jual,
        harga_beli: item.product.harga_beli,
        qty: item.qty,
        transaksi_id: result.transaction.id,
      }));
      setLastTransaction({ ...result.transaction, items: transactionItems });
      setShowReceipt(true);
      clearCart();
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      toast.success(`Transaksi berhasil! Struk #${String(result.no_struk).padStart(4, '0')}`);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Gagal memproses transaksi');
    },
  });

  // Print receipt
  const printReceipt = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow || !lastTransaction) return;
    
    const receiptHtml = generateReceiptHtml(lastTransaction, settings);
    printWindow.document.write(receiptHtml);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 500);
  };

  // Send WhatsApp
  const sendWhatsApp = (transaction: Transaction) => {
    const text = generateStructText(transaction, settings);
    const url = generateWhatsAppLink(customerPhone, text);
    window.open(url, '_blank');
  };

  const copyReceiptText = (transaction: Transaction) => {
    const text = generateStructText(transaction, settings);
    navigator.clipboard.writeText(text);
    toast.success('Teks struk disalin');
  };

  // Handle payment method change
  useEffect(() => {
    if (paymentMethod === 'Tunai') {
      setReceivedAmount(total);
    } else if (isCredit) {
      setReceivedAmount(0);
    } else {
      setReceivedAmount(total);
    }
  }, [paymentMethod, total]);

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-8rem)] items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col lg:flex-row gap-4 overflow-hidden">
      {/* Left Column - Products */}
      <div className="flex-1 flex flex-col min-w-0 lg:max-w-2xl">
        {/* Search & Scanner */}
        <Card className="mb-4">
          <CardContent className="p-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Cari nama, kode, atau supplier..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-10 text-lg h-12"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && search) {
                      const product = products.find(p => 
                        p.kode_barcode === search || 
                        p.nama.toLowerCase() === search.toLowerCase()
                      );
                      if (product) {
                        addToCart(product);
                      } else {
                        toast.error(`Kode ${search} belum terdaftar`);
                      }
                    }
                  }}
                />
              </div>
              <Button
                variant="outline"
                size="lg"
                className="h-12 px-4"
                onClick={() => setShowScanner(true)}
              >
                <Camera className="mr-2 h-5 w-5" />
                Scan
              </Button>
            </div>
            {search && (
              <p className="mt-2 text-sm text-gray-500">
                {filteredProducts.length} barang ditemukan
              </p>
            )}
          </CardContent>
        </Card>

        {/* Product Grid */}
        <Card className="flex-1 overflow-hidden">
          <CardContent className="p-0">
            <ScrollArea className="h-full">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 p-3">
                {filteredProducts.map(product => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onClick={() => addToCart(product)}
                    inCart={cart.some(item => item.product.id === product.id)}
                  />
                ))}
                {filteredProducts.length === 0 && (
                  <div className="col-span-full flex flex-col items-center justify-center py-12 text-gray-500">
                    <Package className="h-12 w-12 mb-2 opacity-50" />
                    <p>Tidak ada barang yang cocok</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Right Column - Cart */}
      <div className="w-full lg:w-96 flex flex-col">
        <Card className="flex-1 flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between">
              Keranjang
              {cart.length > 0 && (
                <Button variant="ghost" size="sm" onClick={clearCart}>
                  <Trash2 className="h-4 w-4 mr-1" />
                  Kosongkan
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          
          <CardContent className="flex-1 overflow-hidden">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-500">
                <Package className="h-16 w-16 mb-4 opacity-30" />
                <p className="text-lg">Keranjang kosong</p>
                <p className="text-sm">Klik barang di kiri untuk menambah</p>
              </div>
            ) : (
              <ScrollArea className="h-[calc(100%-200px)]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">#</TableHead>
                      <TableHead>Barang</TableHead>
                      <TableHead className="w-24 text-right">Qty</TableHead>
                      <TableHead className="w-28 text-right">Subtotal</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cart.map((item, index) => (
                      <TableRow key={item.product.id}>
                        <TableCell className="text-center text-sm text-gray-500">{index + 1}</TableCell>
                        <TableCell>
                          <p className="font-medium">{item.product.nama}</p>
                          <p className="text-xs text-gray-500">{formatRupiahShort(item.product.harga_jual)}/{item.product.satuan}</p>
                        </TableCell>
                        <TableCell className="text-right">
                          <QtyInput
                            value={item.qty}
                            min={item.product.satuan === 'kg' || item.product.satuan === 'm³' ? 0.5 : 1}
                            max={item.product.stok}
                            step={item.product.satuan === 'kg' || item.product.satuan === 'm³' ? 0.5 : 1}
                            onChange={qty => updateQty(item.product.id, qty)}
                          />
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatRupiahShort(item.product.harga_jual * item.qty)}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => removeFromCart(item.product.id)}
                            aria-label="Hapus"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </CardContent>

          <CardFooter className="pt-0">
            <div className="space-y-3 border-t border-gray-200 dark:border-gray-700 pt-4">
              {/* Customer Info */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="block text-xs text-gray-500 mb-1">Pelanggan</Label>
                  <Input
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    placeholder="Umum"
                    className="h-10"
                  />
                </div>
                <div>
                  <Label className="block text-xs text-gray-500 mb-1">No. WhatsApp</Label>
                  <Input
                    value={customerPhone}
                    onChange={e => setCustomerPhone(e.target.value)}
                    placeholder="08xxxxxxxxxx"
                    className="h-10"
                    type="tel"
                  />
                </div>
              </div>

              {/* Discount & Shipping */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="block text-xs text-gray-500 mb-1">Diskon (Rp)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={discount}
                    onChange={e => setDiscount(Math.max(0, Number(e.target.value) || 0))}
                    className="h-10 text-right"
                  />
                </div>
                <div>
                  <Label className="block text-xs text-gray-500 mb-1">Ongkir/Angkut (Rp)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={shipping}
                    onChange={e => setShipping(Math.max(0, Number(e.target.value) || 0))}
                    className="h-10 text-right"
                  />
                </div>
              </div>

              {/* Payment Method */}
              <div>
                <Label className="block text-xs text-gray-500 mb-2">Metode Bayar</Label>
                <RadioGroup value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as 'Tunai' | 'Transfer' | 'QRIS' | 'Kredit-Hutang')} className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {PAYMENT_METHODS.map(({ value, label, icon: Icon }) => (
                    <RadioGroupItem key={value} value={value} className="flex flex-col items-center gap-1 p-2 text-xs">
                      <Icon className="h-5 w-5" />
                      {label}
                    </RadioGroupItem>
                  ))}
                </RadioGroup>
              </div>

              {/* Received Amount */}
              <div>
                <Label className="block text-xs text-gray-500 mb-1">
                  {isCredit ? 'DP / Uang Muka (Rp)' : paymentMethod === 'Tunai' ? 'Uang Diterima (Rp)' : 'Total Bayar (Rp)'}
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="1000"
                  value={receivedAmount}
                  onChange={e => setReceivedAmount(Math.max(0, Number(e.target.value) || 0))}
                  className="h-12 text-right text-xl font-bold text-right"
                  disabled={!isCredit && paymentMethod !== 'Tunai'}
                />
                {paymentMethod === 'Tunai' && (
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 text-right">
                    Kembali: <span className="font-bold text-primary">{formatRupiahShort(change)}</span>
                  </p>
                )}
                {isCredit && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400 text-right">
                    Sisa Hutang: <span className="font-bold">{formatRupiahShort(debt)}</span>
                  </p>
                )}
              </div>

              {/* Totals */}
              <Separator />
              <div className="space-y-2 text-right">
                <div className="flex justify-between text-sm">
                  <span>Subtotal</span>
                  <span className="font-medium">{formatRupiahShort(subtotal)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Diskon</span>
                    <span className="font-medium">-{formatRupiahShort(discount)}</span>
                  </div>
                )}
                {shipping > 0 && (
                  <div className="flex justify-between text-sm">
                    <span>Ongkir</span>
                    <span className="font-medium">+{formatRupiahShort(shipping)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold border-t border-gray-200 dark:border-gray-700 pt-2">
                  <span>TOTAL</span>
                  <span className="text-primary">{formatRupiahShort(total)}</span>
                </div>
              </div>

              {/* Pay Button */}
              <Button
                onClick={() => checkoutMutation.mutate()}
                disabled={!canPay || checkoutMutation.isPending}
                className="w-full"
                size="xl"
              >
                {checkoutMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Memproses...
                  </>
                ) : (
                  'Bayar & Cetak Struk'
                )}
              </Button>

              {isCredit && customerName === 'Umum' && (
                <p className="text-xs text-center text-red-600">
                  <AlertCircle className="h-3 w-3 inline mr-1" />
                  Kredit/Hutang wajib isi nama pelanggan
                </p>
              )}
            </div>
          </CardFooter>
        </Card>
      </div>

      {/* Receipt Dialog */}
      <Dialog open={showReceipt} onOpenChange={setShowReceipt}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Struk Pembayaran</DialogTitle>
          </DialogHeader>
          {lastTransaction && (
            <ReceiptView
              transaction={lastTransaction}
              settings={settings}
              onPrint={printReceipt}
              onWhatsApp={() => sendWhatsApp(lastTransaction!)}
              onCopy={() => copyReceiptText(lastTransaction!)}
              onClose={() => setShowReceipt(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Camera Scanner Dialog */}
      <Dialog open={showScanner} onOpenChange={setShowScanner}>
        <DialogContent className="max-w-sm p-0">
          <DialogHeader className="border-b">
            <DialogTitle className="text-base">Scan Barcode Kamera</DialogTitle>
            <DialogDescription>Arahkan kamera ke barcode barang</DialogDescription>
          </DialogHeader>
          <div className="relative h-64 bg-black" ref={startScanner}>
            {lastScanned && (
              <div className="absolute inset-0 flex items-center justify-center bg-green-500/20">
                <Check className="h-16 w-16 text-green-400" />
              </div>
            )}
          </div>
          <DialogFooter className="border-t">
            <Button variant="outline" className="w-full" onClick={() => setShowScanner(false)}>
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Product Card Component
const ProductCard = ({ product, onClick, inCart }: { product: Product; onClick: () => void; inCart: boolean }) => {
  const lowStock = product.stok > 0 && product.stok <= 10;
  const outOfStock = product.stok <= 0;

  return (
    <button
      onClick={onClick}
      disabled={outOfStock}
      className={cn(
        'relative p-3 text-left rounded-xl border transition-all touch-manipulation',
        'hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary',
        outOfStock
          ? 'opacity-40 bg-gray-100 dark:bg-gray-800 cursor-not-allowed'
          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-primary/50',
        inCart && 'ring-2 ring-primary bg-primary/5'
      )}
      aria-pressed={inCart}
      aria-disabled={outOfStock}
    >
      {outOfStock && (
        <Badge variant="destructive" className="absolute top-2 right-2 z-10">Habis</Badge>
      )}
      {lowStock && !outOfStock && (
        <Badge variant="warning" className="absolute top-2 right-2 z-10">Menipis</Badge>
      )}
      <h3 className="font-medium text-sm mb-1 line-clamp-1">{product.nama}</h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
        Stok: {product.stok} {product.satuan}
      </p>
      <div className="text-lg font-bold text-primary">{formatRupiahShort(product.harga_jual)}/{product.satuan}</div>
      {product.kode_barcode && (
        <p className="text-xs text-gray-400 mt-1 font-mono">{product.kode_barcode}</p>
      )}
    </button>
  );
};

// Quantity Input Component
const QtyInput = ({ value, min, max, step, onChange }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void }) => {
  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        onClick={() => onChange(Math.max(min, value - step))}
        disabled={value <= min}
        aria-label="Kurangi"
      >
        <Minus className="h-4 w-4" />
      </Button>
      <Input
        type="number"
        value={value}
        onChange={e => onChange(Math.min(max, Math.max(min, Number(e.target.value) || min)))}
        onBlur={e => onChange(Math.min(max, Math.max(min, Number(e.target.value) || min)))}
        className="w-20 text-center text-sm h-8"
        min={min}
        max={max}
        step={step}
      />
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        onClick={() => onChange(Math.min(max, value + step))}
        disabled={value >= max}
        aria-label="Tambah"
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
};

// Receipt View Component
const ReceiptView = ({ transaction, settings, onPrint, onWhatsApp, onCopy, onClose }: any) => {
  const { items, ...t } = transaction;
  
  return (
    <div className="font-mono text-sm space-y-3 p-4" style={{ fontSize: '12px', lineHeight: '1.4' }}>
      <div className="text-center space-y-1">
        <p className="font-bold text-base">{settings.nama_toko}</p>
        <p className="text-xs">{settings.alamat_toko}</p>
      </div>
      <hr className="border-t border-dashed" />
      <div className="space-y-1 text-xs">
        <div className="flex justify-between"><span>STRUK:</span> <span className="font-bold">{String(t.no_struk).padStart(4, '0')}</span></div>
        <div className="flex justify-between"><span>Tanggal:</span> <span>{new Date(t.waktu).toLocaleString('id-ID')}</span></div>
        <div className="flex justify-between"><span>Pelanggan:</span> <span>{t.pelanggan}</span></div>
        {t.no_wa && <div className="flex justify-between"><span>WA:</span> <span>{t.no_wa}</span></div>}
      </div>
      <hr className="border-t border-dashed" />
      <div className="space-y-2">
        {items?.map((item: any, i: number) => (
          <div key={i} className="space-y-1">
            <div className="flex justify-between">
              <span>{item.nama}</span>
              <span>{formatRupiahShort(item.harga_jual * item.qty)}</span>
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400 flex justify-between">
              <span>{item.qty} {item.satuan} x {formatRupiahShort(item.harga_jual)}</span>
              <span>{formatRupiahShort(item.harga_jual * item.qty)}</span>
            </div>
          </div>
        ))}
      </div>
      <hr className="border-t border-dashed" />
      <div className="space-y-1 text-xs">
        <div className="flex justify-between"><span>Subtotal</span> <span>{formatRupiahShort(t.subtotal)}</span></div>
        {t.diskon > 0 && <div className="flex justify-between text-green-600"><span>Diskon</span> <span>-{formatRupiahShort(t.diskon)}</span></div>}
        {t.ongkir > 0 && <div className="flex justify-between"><span>Ongkir</span> <span>+{formatRupiahShort(t.ongkir)}</span></div>}
        <div className="flex justify-between font-bold text-lg border-t border-dashed pt-1">
          <span>TOTAL</span> <span>{formatRupiahShort(t.total)}</span>
        </div>
        <div className="flex justify-between"><span>Bayar ({t.metode})</span> <span>{formatRupiahShort(t.dibayar)}</span></div>
        {t.metode === 'Tunai' && t.dibayar > t.total && (
          <div className="flex justify-between"><span>Kembali</span> <span>{formatRupiahShort(t.dibayar - t.total)}</span></div>
        )}
        {t.hutang > 0 && (
          <>
            <div className="flex justify-between text-red-600 font-bold"><span>SISA HUTANG</span> <span>{formatRupiahShort(t.hutang)}</span></div>
            <div className="text-center text-red-600 font-bold">BELUM LUNAS</div>
          </>
        )}
      </div>
      <hr className="border-t border-dashed" />
      <p className="text-center text-xs">Terima kasih telah berbelanja!</p>
      <div className="flex gap-2 pt-2">
        <Button variant="outline" size="sm" className="flex-1" onClick={onPrint}>
          <Printer className="h-4 w-4 mr-1" /> Cetak
        </Button>
        <Button variant="outline" size="sm" className="flex-1" onClick={onWhatsApp}>
          <Send className="h-4 w-4 mr-1" /> WhatsApp
        </Button>
        <Button variant="outline" size="sm" className="flex-1" onClick={onCopy}>
          <Copy className="h-4 w-4 mr-1" /> Salin
        </Button>
      </div>
      <Button variant="ghost" size="sm" className="w-full mt-2" onClick={onClose}>
        <X className="h-4 w-4 mr-1" /> Tutup
      </Button>
    </div>
  );
};