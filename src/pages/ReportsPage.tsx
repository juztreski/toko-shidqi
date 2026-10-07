import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportService, transactionService, productService } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { ReportSummary, DailySales, PaymentMethodSales, TopProduct, StockStatus, Transaction } from '@/types';
import { formatRupiah, formatRupiahShort, formatDate, formatDateInput, formatDateTime, cn } from '@/utils/format';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableFooter } from '@/components/ui/Table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { Separator } from '@/components/ui/Separator';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/Dialog';
import { Calendar, Download, Printer, ChevronLeft, ChevronRight, BarChart2, TrendingUp, DollarSign, CreditCard, Package, Users, AlertCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

const QUICK_RANGES = [
  { label: 'Hari ini', days: 0 },
  { label: '7 hari', days: 6 },
  { label: 'Bulan ini', days: 'month' },
];

export const ReportsPage = () => {
  const { user } = useAuth();
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return formatDateInput(d);
  });
  const [toDate, setToDate] = useState(() => formatDateInput(new Date()));
  const [activeTab, setActiveTab] = useState('ringkasan');
  const [showPrint, setShowPrint] = useState(false);
  const printAreaRef = useRef<HTMLDivElement>(null);

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['reportSummary', fromDate, toDate],
    queryFn: () => reportService.getSummary(fromDate, toDate),
    enabled: !!fromDate && !!toDate,
  });

  const { data: dailySales = [], isLoading: dailyLoading } = useQuery({
    queryKey: ['dailySales', fromDate, toDate],
    queryFn: () => reportService.getDailySales(fromDate, toDate),
    enabled: !!fromDate && !!toDate,
  });

  const { data: paymentMethodSales = [], isLoading: pmLoading } = useQuery({
    queryKey: ['paymentMethodSales', fromDate, toDate],
    queryFn: () => reportService.getPaymentMethodSales(fromDate, toDate),
    enabled: !!fromDate && !!toDate,
  });

  const { data: topProducts = [], isLoading: topLoading } = useQuery({
    queryKey: ['topProducts', fromDate, toDate],
    queryFn: () => reportService.getTopProducts(fromDate, toDate),
    enabled: !!fromDate && !!toDate,
  });

  const { data: lowStock = [], isLoading: lowStockLoading } = useQuery({
    queryKey: ['lowStock'],
    queryFn: () => reportService.getLowStock(),
  });

  const { data: transactions = [], isLoading: txLoading } = useQuery({
    queryKey: ['transactionsReport', fromDate, toDate],
    queryFn: () => transactionService.getAll({ from: fromDate, to: toDate }),
    enabled: !!fromDate && !!toDate,
  });

  const { data: debtPayments = [], isLoading: dpLoading } = useQuery({
    queryKey: ['debtPaymentsReport', fromDate, toDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('debt_payments')
        .select('*')
        .gte('waktu', fromDate)
        .lte('waktu', toDate + 'T23:59:59')
        .order('waktu', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!fromDate && !!toDate,
  });

  const isLoading = summaryLoading || dailyLoading || pmLoading || topLoading || lowStockLoading || txLoading || dpLoading;

  const handleQuickRange = (days: number | string) => {
    const to = new Date();
    const from = new Date();
    if (days === 'month') {
      from.setDate(1);
    } else if (typeof days === 'number') {
      from.setDate(to.getDate() - days);
    }
    setFromDate(formatDateInput(from));
    setToDate(formatDateInput(to));
  };

  const swapDates = () => {
    setFromDate(toDate);
    setToDate(fromDate);
  };

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Ringkasan
    const summaryData = [
      ['Ringkasan Laporan', ''],
      ['Periode', `${formatDate(fromDate)} s/d ${formatDate(toDate)}`],
      ['', ''],
      ['Metrik', 'Nilai'],
      ['Jumlah Transaksi', summary?.jumlah_transaksi || 0],
      ['Omzet', formatRupiah(summary?.omzet || 0)],
      ['Penjualan Kredit (Hutang Baru)', formatRupiah(summary?.penjualan_kredit || 0)],
      ['Pembayaran Hutang Diterima', formatRupiah(summary?.pembayaran_hutang || 0)],
      ['Total Kas Masuk', formatRupiah(summary?.total_kas_masuk || 0)],
      ['Diskon + Ongkir', formatRupiah(summary?.diskon_ongkir || 0)],
      ['Laba Kotor', formatRupiah(summary?.laba_kotor || 0)],
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, ws1, 'Ringkasan');

    // Sheet 2: Rekap Harian
    const dailyHeaders = ['Tanggal', 'Omzet', 'Jumlah Transaksi'];
    const dailyData = dailySales.map(d => [formatDate(d.tanggal), formatRupiah(d.omzet), d.transaksi]);
    const ws2 = XLSX.utils.aoa_to_sheet([dailyHeaders, ...dailyData]);
    XLSX.utils.book_append_sheet(wb, ws2, 'Rekap Harian');

    // Sheet 3: Transaksi
    const txHeaders = ['No Struk', 'Tanggal', 'Pelanggan', 'Metode', 'Subtotal', 'Diskon', 'Ongkir', 'Total', 'Dibayar', 'Hutang', 'Kasir'];
    const txData = transactions.map(t => [
      t.no_struk,
      formatDateTime(t.waktu),
      t.pelanggan,
      t.metode,
      formatRupiah(t.subtotal),
      formatRupiah(t.diskon),
      formatRupiah(t.ongkir),
      formatRupiah(t.total),
      formatRupiah(t.dibayar),
      formatRupiah(t.hutang),
      t.kasir_nama || t.kasir_id,
    ]);
    const ws3 = XLSX.utils.aoa_to_sheet([txHeaders, ...txData]);
    XLSX.utils.book_append_sheet(wb, ws3, 'Transaksi');

    // Sheet 4: Barang Terjual
    const prodHeaders = ['Nama Barang', 'Satuan', 'Qty Terjual', 'Nilai Penjualan'];
    const prodData = topProducts.map(p => [p.nama, p.satuan, p.qty, formatRupiah(p.nilai)]);
    const ws4 = XLSX.utils.aoa_to_sheet([prodHeaders, ...prodData]);
    XLSX.utils.book_append_sheet(wb, ws4, 'Barang Terjual');

    // Sheet 5: Pembayaran Hutang
    const dpHeaders = ['Tanggal', 'Pelanggan', 'Jumlah', 'Kasir'];
    const dpData = debtPayments.map(d => [formatDateTime(d.waktu), d.pelanggan, formatRupiah(d.jumlah), d.kasir_nama || d.kasir_id]);
    const ws5 = XLSX.utils.aoa_to_sheet([dpHeaders, ...dpData]);
    XLSX.utils.book_append_sheet(wb, ws5, 'Pembayaran Hutang');

    XLSX.writeFile(wb, `laporan_shidqi_${fromDate}_${toDate}.xlsx`);
    toast.success('Laporan diekspor ke Excel');
  };

  const printReport = () => {
    setShowPrint(true);
    setTimeout(() => {
      window.print();
      setShowPrint(false);
    }, 100);
  };

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-8rem)] items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const isSingleDay = fromDate === toDate;
  const chartData = isSingleDay 
    ? dailySales.slice(-7) 
    : dailySales.slice(-31);

  return (
    <div className="space-y-4" ref={printAreaRef}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Laporan</h1>
          <p className="text-gray-500">Ringkasan penjualan dan performa toko</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={printReport} disabled={isLoading}>
            <Printer className="h-4 w-4 mr-2" />
            Cetak
          </Button>
          <Button onClick={exportExcel} disabled={isLoading}>
            <Download className="h-4 w-4 mr-2" />
            Ekspor Excel
          </Button>
        </div>
      </div>

      {/* Date Range Picker */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex items-center gap-2 flex-1">
              <Label className="whitespace-nowrap">Dari</Label>
              <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="w-full sm:w-48" />
              <Button variant="ghost" size="icon" onClick={swapDates} aria-label="Tukar tanggal">
                <ChevronLeft className="h-4 w-4" />
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Label className="whitespace-nowrap">Sampai</Label>
              <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="w-full sm:w-48" />
            </div>
            <div className="flex gap-2">
              {QUICK_RANGES.map(range => (
                <Button
                  key={range.label}
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickRange(range.days)}
                >
                  {range.label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
        <SummaryCard title="Transaksi" value={summary?.jumlah_transaksi || 0} icon={DollarSign} color="blue" />
        <SummaryCard title="Omzet" value={formatRupiahShort(summary?.omzet || 0)} icon={TrendingUp} color="green" isCurrency />
        <SummaryCard title="Penjualan Kredit" value={formatRupiahShort(summary?.penjualan_kredit || 0)} icon={CreditCard} color="orange" isCurrency />
        <SummaryCard title="Bayar Hutang" value={formatRupiahShort(summary?.pembayaran_hutang || 0)} icon={Package} color="purple" isCurrency />
        <SummaryCard title="Total Kas Masuk" value={formatRupiahShort(summary?.total_kas_masuk || 0)} icon={DollarSign} color="emerald" isCurrency />
        <SummaryCard title="Diskon + Ongkir" value={formatRupiahShort(summary?.diskon_ongkir || 0)} icon={AlertCircle} color="yellow" isCurrency />
        <SummaryCard title="Laba Kotor" value={formatRupiahShort(summary?.laba_kotor || 0)} icon={BarChart2} color="red" isCurrency />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="ringkasan" value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="ringkasan">Ringkasan</TabsTrigger>
          <TabsTrigger value="harian">Rekap Harian</TabsTrigger>
          <TabsTrigger value="metode">Per Metode</TabsTrigger>
          <TabsTrigger value="produk">Barang Terjual</TabsTrigger>
          <TabsTrigger value="transaksi">Transaksi</TabsTrigger>
          <TabsTrigger value="hutang">Bayar Hutang</TabsTrigger>
        </TabsList>

        <TabsContent value="ringkasan" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Grafik Omzet Harian</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis type="number" tickFormatter={v => formatRupiahShort(v)} />
                    <YAxis dataKey="tanggal" type="category" tickFormatter={v => formatDate(v)} width={100} />
                    <Tooltip formatter={(v: number) => [formatRupiah(v), 'Omzet']} labelFormatter={v => formatDate(String(v))} />
                    <Bar dataKey="omzet" fill="#d9701a" radius={[0, 4, 4, 0]}>
                      {chartData.map((_, i) => <Cell key={`cell-${i}`} fill={i === chartData.length - 1 ? '#c45d15' : '#d9701a'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {isSingleDay && (
                <p className="text-sm text-gray-500 mt-2 text-center">
                  Menampilkan 7 hari terakhir (rentang 1 hari)
                </p>
              )}
            </CardContent>
          </Card>

          {/* Stok Menipis */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-yellow-600" />
                Stok Menipis Saat Ini
              </CardTitle>
            </CardHeader>
            <CardContent>
              {lowStock.length === 0 ? (
                <p className="text-gray-500 text-center py-4">Semua stok aman</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Barang</TableHead>
                        <TableHead>Satuan</TableHead>
                        <TableHead className="text-right">Stok</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lowStock.map(item => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.nama}</TableCell>
                          <TableCell>{item.satuan}</TableCell>
                          <TableCell className="text-right font-mono">{item.stok} {item.satuan}</TableCell>
                          <TableCell>
                            <Badge variant={item.status === 'Habis' ? 'destructive' : 'warning'}>
                              {item.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="harian">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tanggal</TableHead>
                      <TableHead className="text-right">Omzet</TableHead>
                      <TableHead className="text-right">Transaksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dailySales.map((d, i) => (
                      <TableRow key={d.tanggal}>
                        <TableCell>{formatDate(d.tanggal)}</TableCell>
                        <TableCell className="text-right">{formatRupiah(d.omzet)}</TableCell>
                        <TableCell className="text-right">{d.transaksi}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell className="font-bold">Total</TableCell>
                      <TableCell className="text-right font-bold">{formatRupiah(dailySales.reduce((s, d) => s + d.omzet, 0))}</TableCell>
                      <TableCell className="text-right font-bold">{dailySales.reduce((s, d) => s + d.transaksi, 0)}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="metode">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Metode</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Jumlah</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paymentMethodSales.map(m => (
                      <TableRow key={m.metode}>
                        <TableCell className="capitalize">{m.metode}</TableCell>
                        <TableCell className="text-right">{formatRupiah(m.total)}</TableCell>
                        <TableCell className="text-right">{m.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell className="font-bold">Total</TableCell>
                      <TableCell className="text-right font-bold">{formatRupiah(paymentMethodSales.reduce((s, m) => s + m.total, 0))}</TableCell>
                      <TableCell className="text-right font-bold">{paymentMethodSales.reduce((s, m) => s + m.count, 0)}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="produk">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nama Barang</TableHead>
                      <TableHead>Satuan</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Nilai</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topProducts.map(p => (
                      <TableRow key={p.nama}>
                        <TableCell className="font-medium">{p.nama}</TableCell>
                        <TableCell>{p.satuan}</TableCell>
                        <TableCell className="text-right">{p.qty} {p.satuan}</TableCell>
                        <TableCell className="text-right font-medium">{formatRupiah(p.nilai)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={2} className="font-bold">Total</TableCell>
                      <TableCell className="text-right font-bold">{topProducts.reduce((s, p) => s + p.qty, 0)}</TableCell>
                      <TableCell className="text-right font-bold">{formatRupiah(topProducts.reduce((s, p) => s + p.nilai, 0))}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transaksi">
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
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map(t => (
                      <TableRow key={t.id}>
                        <TableCell className="font-mono">#{String(t.no_struk).padStart(4, '0')}</TableCell>
                        <TableCell>{formatDateTime(t.waktu)}</TableCell>
                        <TableCell>{t.pelanggan}</TableCell>
                        <TableCell>
                          <Badge variant={t.metode === 'Kredit-Hutang' ? 'destructive' : 'default'}>{t.metode}</Badge>
                        </TableCell>
                        <TableCell className="text-right">{formatRupiah(t.total)}</TableCell>
                        <TableCell className="text-right">{t.hutang > 0 ? formatRupiah(t.hutang) : '-'}</TableCell>
                        <TableCell>{t.kasir_nama || t.kasir_id}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hutang">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Pelanggan</TableHead>
                      <TableHead className="text-right">Jumlah</TableHead>
                      <TableHead>Kasir</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {debtPayments.map((d, i) => (
                      <TableRow key={d.id}>
                        <TableCell>{formatDateTime(d.waktu)}</TableCell>
                        <TableCell>{d.pelanggan}</TableCell>
                        <TableCell className="text-right font-medium text-green-600">{formatRupiah(d.jumlah)}</TableCell>
                        <TableCell>{d.kasir_nama || d.kasir_id}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={2} className="font-bold">Total</TableCell>
                      <TableCell className="text-right font-bold text-green-600">{formatRupiah(debtPayments.reduce((s, d) => s + d.jumlah, 0))}</TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

const SummaryCard = ({ title, value, icon: Icon, color, isCurrency }: { title: string; value: string | number; icon: React.ComponentType<{ className?: string }>; color: string; isCurrency?: boolean }) => {
  const colors = {
    blue: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400',
    green: 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400',
    orange: 'bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400',
    purple: 'bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400',
    emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400',
    yellow: 'bg-yellow-50 text-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-400',
    red: 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400',
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
          </div>
          <div className={cn('p-3 rounded-xl', colors[color as keyof typeof colors] || colors.blue)}>
            <Icon className="h-6 w-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

import { supabase } from '@/lib/supabase';