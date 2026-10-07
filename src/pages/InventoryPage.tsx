import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { productService, reportService } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { Product, StockStatus } from '@/types';
import { formatRupiah, formatRupiahShort, cn } from '@/utils/format';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select } from '@/components/ui/Select';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/Card';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/Dialog';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableFooter } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Plus, Minus, Search, Download, Filter, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

const stockAdjustSchema = z.object({
  type: z.enum(['add', 'set']),
  qty: z.coerce.number().min(0.5, 'Qty minimal 0.5'),
  note: z.string().optional(),
});

type StockAdjustForm = z.infer<typeof stockAdjustSchema>;

export const InventoryPage = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [adjustingProduct, setAdjustingProduct] = useState<Product | null>(null);
  const [adjustType, setAdjustType] = useState<'add' | 'set'>('add');

  const { data: products = [], isLoading, refetch } = useQuery({
    queryKey: ['products'],
    queryFn: productService.getAll,
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: productService.getSuppliers,
  });

  const { data: lowStock = [] } = useQuery({
    queryKey: ['lowStock'],
    queryFn: reportService.getLowStock,
  });

  const addStockMutation = useMutation({
    mutationFn: ({ id, delta }: { id: string; delta: number }) => productService.adjustStock(id, delta),
    onSuccess: () => {
      toast.success('Stok berhasil ditambah');
      refetch();
      queryClient.invalidateQueries({ queryKey: ['lowStock'] });
      setAdjustingProduct(null);
    },
    onError: (error: any) => toast.error(error.message),
  });

  const setStockMutation = useMutation({
    mutationFn: ({ id, stok }: { id: string; stok: number }) => productService.setStock(id, stok),
    onSuccess: () => {
      toast.success('Stok berhasil dikoreksi');
      refetch();
      queryClient.invalidateQueries({ queryKey: ['lowStock'] });
      setAdjustingProduct(null);
    },
    onError: (error: any) => toast.error(error.message),
  });

  const form = useForm<StockAdjustForm>({
    resolver: zodResolver(stockAdjustSchema) as any,
    defaultValues: { type: 'add', qty: 1, note: '' },
  });

  const onSubmit = (data: StockAdjustForm) => {
    if (!adjustingProduct) return;
    if (adjustType === 'add') {
      addStockMutation.mutate({ id: adjustingProduct.id, delta: data.qty });
    } else {
      setStockMutation.mutate({ id: adjustingProduct.id, stok: data.qty });
    }
  };

  const openAdjust = (product: Product, type: 'add' | 'set') => {
    setAdjustingProduct(product);
    setAdjustType(type);
    form.reset({ type, qty: type === 'add' ? 1 : product.stok, note: '' });
  };

  // Compute stock status for each product
  const productsWithStatus = products.map(p => {
    let status: 'Aman' | 'Menipis' | 'Habis' = 'Aman';
    if (p.stok <= 0) status = 'Habis';
    else if (p.stok <= 10) status = 'Menipis';
    return { ...p, status };
  });

  const filteredProducts = productsWithStatus.filter(p => {
    const q = search.toLowerCase();
    const matchSearch = p.nama.toLowerCase().includes(q) || 
                        p.kode_barcode?.toLowerCase().includes(q) || 
                        p.supplier?.toLowerCase().includes(q);
    const matchSupplier = !selectedSupplier || p.supplier === selectedSupplier || (!p.supplier && selectedSupplier === 'Tanpa supplier');
    const matchStatus = selectedStatus === 'all' || p.status.toLowerCase() === selectedStatus;
    return matchSearch && matchSupplier && matchStatus;
  });

  // Summary stats
  const totalTypes = products.length;
  const totalValue = products.reduce((sum, p) => sum + p.harga_jual * p.stok, 0);
  const lowCount = products.filter(p => p.stok > 0 && p.stok <= 10).length;
  const emptyCount = products.filter(p => p.stok <= 0).length;

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const headers = ['No', 'Barang', 'Supplier', 'Satuan', 'Harga Jual', 'Stok', 'Nilai Stok', 'Status'];
    const data = filteredProducts.map((p, i) => [
      i + 1,
      p.nama,
      p.supplier || '',
      p.satuan,
      p.harga_jual,
      p.stok,
      p.harga_jual * p.stok,
      p.status,
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    XLSX.utils.book_append_sheet(wb, ws, 'Stok');
    XLSX.writeFile(wb, `stok_shidqi_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const printReport = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    
    const printHeaders = ['No', 'Barang', 'Supplier', 'Satuan', 'Harga Jual', 'Stok', 'Nilai Stok', 'Status'];
    const printData = filteredProducts.map((p, i) => [
      i + 1,
      p.nama,
      p.supplier || '',
      p.satuan,
      p.harga_jual,
      p.stok,
      p.harga_jual * p.stok,
      p.status,
    ]);
    
    const html = `
      <html>
        <head>
          <title>Laporan Stok - TOko Shidqi Bangunan</title>
          <style>
            body { font-family: monospace; font-size: 11px; padding: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 4px; text-align: left; }
            th { background: #f3f4f6; }
            .text-right { text-align: right; }
            .text-center { text-align: center; }
            h1 { text-align: center; margin: 0; }
            .subtitle { text-align: center; color: #666; margin: 5px 0 20px; }
            .summary { display: flex; justify-content: space-around; margin: 20px 0; font-size: 12px; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <h1>TOKO SHIDQI BANGUNAN</h1>
          <p class="subtitle">Jalan H.Muh Tang Labokong | ${new Date().toLocaleString('id-ID')}</p>
          <div class="summary">
            <div>Jenis Barang: ${totalTypes}</div>
            <div>Total Nilai: ${formatRupiah(totalValue)}</div>
            <div>Menipis: ${lowCount}</div>
            <div>Habis: ${emptyCount}</div>
          </div>
          <table>
            <thead>
              <tr>${printHeaders.map(h => `<th>${h}</th>`).join('')}</tr>
            </thead>
            <tbody>
              ${printData.map(row => `<tr>${row.map((cell, i) => `<td class="${i >= 4 ? 'text-right' : ''}${i === 7 ? ' text-center' : ''}">${cell}</td>`).join('')}</tr>`).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 500);
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
          <h1 className="text-2xl font-bold">Stok Barang</h1>
          <p className="text-gray-500">Pantau ketersediaan barang</p>
        </div>
        <div className="flex gap-2">
          {user?.role === 'owner' && (
            <>
              <Button variant="outline" onClick={printReport}>
                <Download className="h-4 w-4 mr-2" />
                Cetak
              </Button>
              <Button variant="outline" onClick={exportExcel}>
                <Download className="h-4 w-4 mr-2" />
                Ekspor Excel
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">Jenis Barang</p>
            <p className="text-2xl font-bold">{totalTypes}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">Total Nilai Stok</p>
            <p className="text-2xl font-bold text-primary">{formatRupiahShort(totalValue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">Menipis (≤10)</p>
            <p className="text-2xl font-bold text-yellow-600">{lowCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">Habis (0)</p>
            <p className="text-2xl font-bold text-red-600">{emptyCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filter */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <Input
                placeholder="Cari barang atau supplier..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={selectedSupplier} onValueChange={setSelectedSupplier} className="w-full sm:w-48">
              <option value="">Semua Supplier</option>
              <option value="Tanpa supplier">Tanpa supplier</option>
              {suppliers.map(s => <option key={s} value={s}>{s}</option>)}
            </Select>
            <Select value={selectedStatus} onValueChange={setSelectedStatus} className="w-full sm:w-40">
              <option value="all">Semua Status</option>
              <option value="aman">Aman</option>
              <option value="menipis">Menipis</option>
              <option value="habis">Habis</option>
            </Select>
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
                  <TableHead className="w-10">No</TableHead>
                  <TableHead>Barang</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Satuan</TableHead>
                  <TableHead className="text-right">Harga Jual</TableHead>
                  <TableHead className="text-right">Stok</TableHead>
                  <TableHead className="text-right">Nilai Stok</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  {user?.role === 'owner' && <TableHead className="w-28">Aksi</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((product, index) => (
                  <TableRow key={product.id}>
                    <TableCell className="text-center text-sm text-gray-500">{index + 1}</TableCell>
                    <TableCell className="font-medium">{product.nama}</TableCell>
                    <TableCell>{product.supplier || '-'}</TableCell>
                    <TableCell>{product.satuan}</TableCell>
                    <TableCell className="text-right">{formatRupiah(product.harga_jual)}</TableCell>
                    <TableCell className="text-right font-mono">{product.stok} {product.satuan}</TableCell>
                    <TableCell className="text-right">{formatRupiah(product.harga_jual * product.stok)}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={
                        product.status === 'Habis' ? 'destructive' : 
                        product.status === 'Menipis' ? 'warning' : 'success'
                      }>
                        {product.status}
                      </Badge>
                    </TableCell>
                    {user?.role === 'owner' && (
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => openAdjust(product, 'add')} aria-label="Tambah stok">
                            <Plus className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => openAdjust(product, 'set')} aria-label="Koreksi stok">
                            <AlertCircle className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {filteredProducts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={user?.role === 'owner' ? 9 : 8} className="text-center py-8 text-gray-500">
                      Tidak ada barang ditemukan
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3} className="font-bold">Total</TableCell>
                  <TableCell className="font-bold"></TableCell>
                  <TableCell className="font-bold text-right">{formatRupiahShort(filteredProducts.reduce((s, p) => s + p.harga_jual * p.stok, 0))}</TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Adjust Stock Dialog */}
      <Dialog open={!!adjustingProduct} onOpenChange={open => !open && setAdjustingProduct(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{adjustType === 'add' ? 'Tambah Stok' : 'Koreksi Stok'}</DialogTitle>
            <DialogDescription>{adjustingProduct?.nama}</DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="p-4 space-y-4">
            <div className="space-y-1.5">
              <Label>Stok Saat Ini</Label>
              <Input value={`${adjustingProduct?.stok} ${adjustingProduct?.satuan}`} disabled />
            </div>
            <div className="space-y-1.5">
              <Label>{adjustType === 'add' ? 'Tambah Qty' : 'Stok Sebenarnya'}</Label>
              <Input type="number" min="0.5" step="0.5" {...form.register('qty')} />
              {form.formState.errors.qty && <p className="text-sm text-red-600">{form.formState.errors.qty.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Catatan (opsional)</Label>
              <Input {...form.register('note')} placeholder="Contoh: Barang masuk dari supplier" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAdjustingProduct(null)}>Batal</Button>
              <Button type="submit" disabled={addStockMutation.isPending || setStockMutation.isPending}>
                {addStockMutation.isPending || setStockMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Menyimpan...
                  </>
                ) : (
                  adjustType === 'add' ? 'Tambah' : 'Koreksi'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};