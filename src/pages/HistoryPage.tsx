import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { transactionService } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { Transaction } from '@/types';
import { formatRupiah, formatRupiahShort, formatDateTime, generateStructText, generateWhatsAppLink, cn } from '@/utils/format';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/Dialog';
import { Separator } from '@/components/ui/Separator';
import { Search, Download, Printer, Send, Copy, Eye, Loader2, X, CreditCard, Banknote, Smartphone, QrCode } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';

export const HistoryPage = () => {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [settings, setSettings] = useState({ nama_toko: 'TOKO SHIDQI BANGUNAN', alamat_toko: 'Jalan H.Muh Tang Labokong', terapkan_pajak_struk: false });

  const { data: transactions = [], isLoading, refetch } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => transactionService.getAll(),
  });

  useEffect(() => {
    const fetchSettings = async () => {
      const { data } = await supabase.from('settings').select('*').limit(1).single();
      if (data) setSettings(data);
    };
    fetchSettings();
  }, []);

  const filteredTransactions = transactions.filter(t => {
    const q = search.toLowerCase();
    return t.pelanggan.toLowerCase().includes(q) || 
           String(t.no_struk).includes(q) || 
           t.metode.toLowerCase().includes(q) ||
           t.kasir_nama?.toLowerCase().includes(q);
  });

  const totalOmzet = filteredTransactions.reduce((sum, t) => sum + t.total, 0);

  const exportExcel = () => {
    if (user?.role !== 'owner') {
      toast.error('Hanya pemilik yang bisa ekspor Excel');
      return;
    }

    const wb = XLSX.utils.book_new();

    // Sheet 1: Transaksi
    const txHeaders = ['No Struk', 'Tanggal', 'Pelanggan', 'No WA', 'Metode', 'Subtotal', 'Diskon', 'Ongkir', 'Total', 'Dibayar', 'Hutang', 'Kasir'];
    const txData = filteredTransactions.map(t => [
      t.no_struk,
      formatDateTime(t.waktu),
      t.pelanggan,
      t.no_wa || '',
      t.metode,
      formatRupiah(t.subtotal),
      formatRupiah(t.diskon),
      formatRupiah(t.ongkir),
      formatRupiah(t.total),
      formatRupiah(t.dibayar),
      formatRupiah(t.hutang),
      t.kasir_nama || t.kasir_id,
    ]);
    const ws1 = XLSX.utils.aoa_to_sheet([txHeaders, ...txData]);
    XLSX.utils.book_append_sheet(wb, ws1, 'Transaksi');

    // Sheet 2: Detail Barang
    const itemHeaders = ['No Struk', 'Tanggal', 'Pelanggan', 'Nama Barang', 'Satuan', 'Harga Jual', 'Harga Beli', 'Qty', 'Subtotal'];
    const itemData = filteredTransactions.flatMap(t => 
      t.items?.map(item => [
        t.no_struk,
        formatDateTime(t.waktu),
        t.pelanggan,
        item.nama,
        item.satuan,
        formatRupiah(item.harga_jual),
        formatRupiah(item.harga_beli || 0),
        item.qty,
        formatRupiah(item.harga_jual * item.qty),
      ]) || []
    );
    const ws2 = XLSX.utils.aoa_to_sheet([itemHeaders, ...itemData]);
    XLSX.utils.book_append_sheet(wb, ws2, 'Detail Barang');

    // Sheet 3: Hutang
    const debtData = filteredTransactions
      .filter(t => t.hutang > 0)
      .map(t => [
        t.no_struk,
        formatDateTime(t.waktu),
        t.pelanggan,
        t.no_wa || '',
        formatRupiah(t.total),
        formatRupiah(t.dibayar),
        formatRupiah(t.hutang),
      ]);
    const debtHeaders = ['No Struk', 'Tanggal', 'Pelanggan', 'No WA', 'Total', 'DP', 'Sisa Hutang'];
    const ws3 = XLSX.utils.aoa_to_sheet([debtHeaders, ...debtData]);
    XLSX.utils.book_append_sheet(wb, ws3, 'Hutang');

    // Sheet 4: Stok (snapshot saat ini - ambil dari products)
    // We'll skip this for now as it needs current stock data

    XLSX.writeFile(wb, `riwayat_shidqi_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success('Riwayat diekspor ke Excel');
  };

  const printReceipt = (transaction: Transaction) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    
    const receiptHtml = generateReceiptHtml(transaction, settings);
    printWindow.document.write(receiptHtml);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 500);
  };

  const sendWhatsApp = (transaction: Transaction) => {
    const text = generateStructText(transaction, settings);
    const url = generateWhatsAppLink(transaction.no_wa || '', text);
    window.open(url, '_blank');
  };

  const copyReceipt = (transaction: Transaction) => {
    const text = generateStructText(transaction, settings);
    navigator.clipboard.writeText(text);
    toast.success('Teks struk disalin');
  };

  const openReceipt = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
  };

  const getMethodIcon = (metode: string) => {
    switch (metode) {
      case 'Tunai': return <Banknote className="h-4 w-4" />;
      case 'Transfer': return <Smartphone className="h-4 w-4" />;
      case 'QRIS': return <QrCode className="h-4 w-4" />;
      case 'Kredit-Hutang': return <CreditCard className="h-4 w-4" />;
      default: return <Banknote className="h-4 w-4" />;
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-8rem)] items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Riwayat Transaksi</h1>
          <p className="text-gray-500">Lihat dan kelola transaksi sebelumnya</p>
        </div>
        <div className="flex gap-2">
          {user?.role === 'owner' && (
            <Button variant="outline" onClick={exportExcel}>
              <Download className="h-4 w-4 mr-2" />
              Ekspor Excel
            </Button>
          )}
        </div>
      </div>

      {/* Summary */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Transaksi</p>
              <p className="text-2xl font-bold">{filteredTransactions.length}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Total Omzet</p>
              <p className="text-2xl font-bold text-primary">{formatRupiahShort(totalOmzet)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <Input
              placeholder="Cari pelanggan, no struk, metode, kasir..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">No Struk</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Pelanggan</TableHead>
                  <TableHead>Metode</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Hutang</TableHead>
                  <TableHead>Kasir</TableHead>
                  <TableHead className="w-24">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransactions.map(t => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono">#{String(t.no_struk).padStart(4, '0')}</TableCell>
                    <TableCell>{formatDateTime(t.waktu)}</TableCell>
                    <TableCell className="font-medium">{t.pelanggan}</TableCell>
                    <TableCell>
                      <Badge variant={t.metode === 'Kredit-Hutang' ? 'destructive' : 'default'} className="flex items-center gap-1">
                        {getMethodIcon(t.metode)}
                        {t.metode}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatRupiah(t.total)}</TableCell>
                    <TableCell className="text-right">
                      {t.hutang > 0 ? (
                        <span className="text-red-600 font-medium">{formatRupiah(t.hutang)}</span>
                      ) : '-'}
                    </TableCell>
                    <TableCell>{t.kasir_nama || t.kasir_id}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => openReceipt(t)} aria-label="Lihat struk">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredTransactions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                      Tidak ada transaksi ditemukan
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Receipt Dialog */}
      <Dialog open={!!selectedTransaction} onOpenChange={open => !open && setSelectedTransaction(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Struk Pembayaran</DialogTitle>
          </DialogHeader>
          {selectedTransaction && (
            <ReceiptView
              transaction={selectedTransaction}
              settings={settings}
              onPrint={() => printReceipt(selectedTransaction!)}
              onWhatsApp={() => sendWhatsApp(selectedTransaction!)}
              onCopy={() => copyReceipt(selectedTransaction!)}
              onClose={() => setSelectedTransaction(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

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
        <div className="flex justify-between"><span>Tanggal:</span> <span>{formatDateTime(t.waktu)}</span></div>
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

const generateReceiptHtml = (transaction: Transaction, settings: any) => {
  const { items, ...t } = transaction;
  return `
    <html>
      <head>
        <title>Struk #${String(t.no_struk).padStart(4, '0')}</title>
        <style>
          body { font-family: monospace; font-size: 12px; line-height: 1.4; padding: 20px; max-width: 300px; margin: 0 auto; }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .right { text-align: right; }
          .dashed { border-top: 1px dashed #000; margin: 8px 0; }
          .red { color: red; }
          @media print { body { padding: 0; } .no-print { display: none; } }
        </style>
      </head>
      <body>
        <div class="center">
          <div class="bold" style="font-size: 14px;">${settings.nama_toko}</div>
          <div>${settings.alamat_toko}</div>
        </div>
        <div class="dashed"></div>
        <div><span>STRUK:</span> <span class="right bold">#${String(t.no_struk).padStart(4, '0')}</span></div>
        <div><span>Tanggal:</span> <span class="right">${formatDateTime(t.waktu)}</span></div>
        <div><span>Pelanggan:</span> <span class="right">${t.pelanggan}</span></div>
        ${t.no_wa ? `<div><span>WA:</span> <span class="right">${t.no_wa}</span></div>` : ''}
        <div class="dashed"></div>
        ${items?.map((item: any) => `
          <div>${item.nama}</div>
          <div class="right">${item.qty} ${item.satuan} x ${formatRupiahShort(item.harga_jual)} = ${formatRupiahShort(item.harga_jual * item.qty)}</div>
        `).join('') || ''}
        <div class="dashed"></div>
        <div><span>Subtotal</span> <span class="right">${formatRupiahShort(t.subtotal)}</span></div>
        ${t.diskon > 0 ? `<div style="color: green;"><span>Diskon</span> <span class="right">-${formatRupiahShort(t.diskon)}</span></div>` : ''}
        ${t.ongkir > 0 ? `<div><span>Ongkir</span> <span class="right">+${formatRupiahShort(t.ongkir)}</span></div>` : ''}
        <div class="bold" style="font-size: 14px;"><span>TOTAL</span> <span class="right">${formatRupiahShort(t.total)}</span></div>
        <div><span>Bayar (${t.metode})</span> <span class="right">${formatRupiahShort(t.dibayar)}</span></div>
        ${t.metode === 'Tunai' && t.dibayar > t.total ? `<div><span>Kembali</span> <span class="right">${formatRupiahShort(t.dibayar - t.total)}</span></div>` : ''}
        ${t.hutang > 0 ? `
          <div class="red bold"><span>SISA HUTANG</span> <span class="right">${formatRupiahShort(t.hutang)}</span></div>
          <div class="center red bold">BELUM LUNAS</div>
        ` : ''}
        <div class="dashed"></div>
        <div class="center">Terima kasih telah berbelanja!</div>
        <div class="center no-print" style="margin-top: 20px;">
          <button onclick="window.print()" style="padding: 8px 16px; margin: 4px; background: #d9701a; color: white; border: none; border-radius: 4px; cursor: pointer;">Cetak</button>
          <button onclick="window.close()" style="padding: 8px 16px; margin: 4px; background: #666; color: white; border: none; border-radius: 4px; cursor: pointer;">Tutup</button>
        </div>
      </body>
    </html>
  `;
};