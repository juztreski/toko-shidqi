import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { productService } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { Product } from '@/types';
import { formatRupiah, cn } from '@/utils/format';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select } from '@/components/ui/Select';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/Card';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/Dialog';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { AlertDialog } from '@/components/ui/AlertDialog';

import { Plus, Edit, Trash2, Search, Download, Upload, FileSpreadsheet, Barcode, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

const productSchema = z.object({
  nama: z.string().min(1, 'Nama barang wajib diisi'),
  kode_barcode: z.string().optional(),
  supplier: z.string().optional(),
  satuan: z.string().min(1, 'Satuan wajib diisi'),
  harga_beli: z.coerce.number().min(0).optional(),
  harga_jual: z.coerce.number().min(1, 'Harga jual wajib diisi'),
  pajak_persen: z.coerce.number().min(0).max(100).default(0),
  stok: z.coerce.number().min(0).default(0),
});

type ProductForm = z.infer<typeof productSchema>;

const DEFAULT_SUPPLIERS = [
  'Tiga Roda', 'Gresik', 'Semen Indonesia', 'Rucika', 'Dulux', 
  'BJLS', 'SNI', 'Bendrat', 'Local'
];

export const ProductsPage = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<any>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [barcodeScanTarget, setBarcodeScanTarget] = useState<'form' | 'search'>('form');

  const { data: products = [], isLoading, refetch } = useQuery({
    queryKey: ['products'],
    queryFn: productService.getAll,
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: productService.getSuppliers,
  });

  const allSuppliers = [...new Set([...DEFAULT_SUPPLIERS, ...suppliers])].sort();

  const createMutation = useMutation({
    mutationFn: productService.create,
    onSuccess: () => {
      toast.success('Barang berhasil ditambahkan');
      refetch();
      setShowForm(false);
      setEditingProduct(null);
    },
    onError: (error: any) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Product> }) => productService.update(id, data),
    onSuccess: () => {
      toast.success('Barang berhasil diperbarui');
      refetch();
      setShowForm(false);
      setEditingProduct(null);
    },
    onError: (error: any) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: productService.delete,
    onSuccess: () => {
      toast.success('Barang berhasil dihapus');
      refetch();
      setDeletingId(null);
    },
    onError: (error: any) => toast.error(error.message),
  });

  const form = useForm<ProductForm>({
    resolver: zodResolver(productSchema) as any,
    defaultValues: {
      nama: '',
      kode_barcode: '',
      supplier: '',
      satuan: '',
      harga_beli: 0,
      harga_jual: 0,
      pajak_persen: 0,
      stok: 0,
    },
  });

  const onSubmit = (data: ProductForm) => {
    if (editingProduct) {
      updateMutation.mutate({ id: editingProduct.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const openCreate = () => {
    form.reset({ nama: '', kode_barcode: '', supplier: '', satuan: '', harga_beli: 0, harga_jual: 0, pajak_persen: 0, stok: 0 });
    setEditingProduct(null);
    setShowForm(true);
  };

  const openEdit = (product: Product) => {
    form.reset({
      nama: product.nama,
      kode_barcode: product.kode_barcode || '',
      supplier: product.supplier || '',
      satuan: product.satuan,
      harga_beli: product.harga_beli || 0,
      harga_jual: product.harga_jual,
      pajak_persen: product.pajak_persen,
      stok: product.stok,
    });
    setEditingProduct(product);
    setShowForm(true);
  };

  const handleImport = async (file: File) => {
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      
      const preview = await processImportRows(rows, products);
      setImportPreview(preview);
      setShowImportDialog(true);
    } catch (error) {
      toast.error('Gagal membaca file: ' + (error as Error).message);
    }
  };

  const processImportRows = async (rows: any[], existingProducts: Product[]) => {
    const existingByName = new Map(existingProducts.map(p => [p.nama.toLowerCase(), p]));
    const existingByBarcode = new Map(existingProducts.filter(p => p.kode_barcode).map(p => [p.kode_barcode!, p]));
    
    const results = {
      baru: 0,
      diperbarui: 0,
      dilewati: 0,
      errors: [] as { row: number; reason: string }[],
      preview: [] as Product[],
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // +2 for header and 1-indexed
      
      try {
        const mapped = mapRowToProduct(row);
        
        if (!mapped.nama || !mapped.satuan || !mapped.harga_jual) {
          results.dilewati++;
          results.errors.push({ row: rowNum, reason: 'Nama, satuan, atau harga jual kosong' });
          continue;
        }
        
        if (mapped.harga_jual < 0 || (mapped.harga_beli ?? 0) < 0 || mapped.stok < 0 || mapped.pajak_persen < 0) {
          results.dilewati++;
          results.errors.push({ row: rowNum, reason: 'Nilai negatif tidak diperbolehkan' });
          continue;
        }

        const existingByNameKey = existingByName.get(mapped.nama.toLowerCase());
        const existingByBarcodeKey = mapped.kode_barcode ? existingByBarcode.get(mapped.kode_barcode) : null;
        
        if (existingByBarcodeKey && existingByBarcodeKey.id !== existingByNameKey?.id) {
          results.dilewati++;
          results.errors.push({ row: rowNum, reason: `Kode barcode ${mapped.kode_barcode} sudah dipakai barang lain` });
          continue;
        }

        if (existingByNameKey) {
          results.diperbarui++;
          results.preview.push({ ...existingByNameKey, ...mapped, id: existingByNameKey.id });
        } else {
          results.baru++;
          results.preview.push({ ...mapped, id: `new-${results.baru}` } as Product);
        }
      } catch (e) {
        results.dilewati++;
        results.errors.push({ row: rowNum, reason: (e as Error).message });
      }
    }
    
    return results;
  };

  const mapRowToProduct = (row: any): Partial<Product> => {
    const getVal = (keys: string[]) => {
      for (const key of keys) {
        const val = row[key];
        if (val !== undefined && val !== '') return val;
      }
      return undefined;
    };

    const parsePrice = (val: any): number => {
      if (typeof val === 'number') return val;
      if (!val) return 0;
      return Number(String(val).replace(/[^0-9.,-]/g, '').replace(',', '.')) || 0;
    };

    const parsePercent = (val: any): number => {
      if (typeof val === 'number') return val;
      if (!val) return 0;
      return Number(String(val).replace('%', '').replace(',', '.')) || 0;
    };

    const parseBarcode = (val: any): string => {
      if (!val) return '';
      return String(val).trim();
    };

    return {
      nama: getVal(['Nama Barang', 'Nama', 'Barang', 'Produk', 'Product Name']),
      kode_barcode: parseBarcode(getVal(['Kode Barcode', 'Barcode', 'Kode', 'Code'])),
      supplier: getVal(['Supplier', 'Pemasok', 'Vendor']),
      satuan: getVal(['Satuan', 'Unit', 'UOM']) || 'pcs',
      harga_beli: parsePrice(getVal(['Harga Beli', 'Modal', 'Beli', 'Cost', 'Harga Modal'])),
      harga_jual: parsePrice(getVal(['Harga Jual', 'Harga', 'Jual', 'Price', 'Harga Jual Ecer'])),
      pajak_persen: parsePercent(getVal(['Pajak (%)', 'Pajak', 'PPN', 'Tax (%)', 'Tax'])),
      stok: Number(getVal(['Stok', 'Stock', 'Qty', 'Quantity']) || 0),
    };
  };

  const confirmImport = async () => {
    if (!importPreview) return;
    
    try {
      for (const product of importPreview.preview) {
        if (product.id.startsWith('new-')) {
          const { id, ...data } = product;
          await productService.create(data as Omit<Product, 'id' | 'created_at' | 'updated_at'>);
        } else {
          const { id, created_at, updated_at, ...data } = product;
          await productService.update(id, data);
        }
      }
      toast.success(`Impor selesai: ${importPreview.baru} baru, ${importPreview.diperbarui} diperbarui`);
      refetch();
      setShowImportDialog(false);
      setImportPreview(null);
      setImportFile(null);
    } catch (error) {
      toast.error('Gagal impor: ' + (error as Error).message);
    }
  };

  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new();
    
    // Main sheet
    const headers = ['Nama Barang', 'Kode Barcode', 'Supplier', 'Satuan', 'Harga Beli', 'Harga Jual', 'Pajak (%)', 'Stok'];
    const sample1 = ['Semen Tiga Roda 50kg', '8991234567890', 'Tiga Roda', 'sak', 60000, 68000, 10, 100];
    const sample2 = ['Besi Beton 10mm SNI', '8990987654321', 'SNI', 'batang', 70000, 78000, 10, 50];
    const ws = XLSX.utils.aoa_to_sheet([headers, sample1, sample2]);
    XLSX.utils.book_append_sheet(wb, ws, 'Barang');
    
    // Instructions sheet
    const instructions = [
      ['PETUNJUK IMPOR BARANG'],
      [''],
      ['Format kolom (wajib):'],
      ['Nama Barang', 'Kode Barcode', 'Supplier', 'Satuan', 'Harga Beli', 'Harga Jual', 'Pajak (%)', 'Stok'],
      [''],
      ['Aturan:'],
      ['1. Nama Barang, Satuan, Harga Jual wajib diisi'],
      ['2. Nama Barang sama (tidak peka huruf besar/kecil) = update data'],
      ['3. Nama Barang baru = tambah data baru'],
      ['4. Kode Barcode harus unik, kosongkan jika tidak ada'],
      ['5. Harga Beli, Pajak, Stok boleh kosong (default 0)'],
      ['6. Format angka: "Rp 68.000" atau "68000" atau "68,000"'],
      ['7. Format pajak: "10%" atau "10"'],
      ['8. Baris bermasalah akan dilewati dan dilaporkan'],
      [''],
      ['Contoh supplier: Tiga Roda, Gresik, Rucika, Dulux, BJLS, SNI, Local'],
    ];
    const wsInstr = XLSX.utils.aoa_to_sheet(instructions);
    XLSX.utils.book_append_sheet(wb, wsInstr, 'Petunjuk');
    
    XLSX.writeFile(wb, 'template_barang_shidqi.xlsx');
  };

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const headers = ['Nama Barang', 'Kode Barcode', 'Supplier', 'Satuan', 'Harga Beli', 'Harga Jual', 'Pajak (%)', 'Stok'];
    const data = products.map(p => [
      p.nama,
      p.kode_barcode || '',
      p.supplier || '',
      p.satuan,
      p.harga_beli || 0,
      p.harga_jual,
      p.pajak_persen,
      p.stok,
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    XLSX.utils.book_append_sheet(wb, ws, 'Barang');
    XLSX.writeFile(wb, `barang_shidqi_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const filteredProducts = products.filter(p => {
    const q = search.toLowerCase();
    const matchSearch = p.nama.toLowerCase().includes(q) || 
                        p.kode_barcode?.toLowerCase().includes(q) || 
                        p.supplier?.toLowerCase().includes(q);
    const matchSupplier = !selectedSupplier || p.supplier === selectedSupplier || (!p.supplier && selectedSupplier === 'Tanpa supplier');
    return matchSearch && matchSupplier;
  });

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
          <h1 className="text-2xl font-bold">Barang</h1>
          <p className="text-gray-500">Kelola data barang toko</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={downloadTemplate}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Unduh Template
          </Button>
          <Button variant="outline" onClick={exportExcel}>
            <Download className="h-4 w-4 mr-2" />
            Ekspor Excel
          </Button>
          <Button onClick={() => { setImportFile(null); setImportPreview(null); setShowImportDialog(true); }}>
            <Upload className="h-4 w-4 mr-2" />
            Impor Excel
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Tambah Barang
          </Button>
        </div>
      </div>

      {/* Search & Filter */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <Input
                placeholder="Cari nama, kode, atau supplier..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={selectedSupplier} onValueChange={setSelectedSupplier} className="w-full sm:w-48">
              <option value="">Semua Supplier</option>
              <option value="Tanpa supplier">Tanpa supplier</option>
              {allSuppliers.map(s => <option key={s} value={s}>{s}</option>)}
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
                  <TableHead className="w-8">No</TableHead>
                  <TableHead>Nama Barang</TableHead>
                  <TableHead>Kode Barcode</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Satuan</TableHead>
                  <TableHead className="text-right">Harga Beli</TableHead>
                  <TableHead className="text-right">Harga Jual</TableHead>
                  <TableHead className="text-center">Pajak</TableHead>
                  <TableHead className="text-right">Stok</TableHead>
                  <TableHead className="w-24">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((product, index) => (
                  <TableRow key={product.id}>
                    <TableCell className="text-center text-sm text-gray-500">{index + 1}</TableCell>
                    <TableCell className="font-medium">{product.nama}</TableCell>
                    <TableCell className="font-mono text-sm">{product.kode_barcode || '-'}</TableCell>
                    <TableCell>{product.supplier || '-'}</TableCell>
                    <TableCell>{product.satuan}</TableCell>
                    <TableCell className="text-right">{formatRupiah(product.harga_beli || 0)}</TableCell>
                    <TableCell className="text-right font-medium">{formatRupiah(product.harga_jual)}</TableCell>
                    <TableCell className="text-center">{product.pajak_persen}%</TableCell>
                    <TableCell className="text-right font-mono">{product.stok} {product.satuan}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(product)} aria-label="Edit">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-red-600" onClick={() => setDeletingId(product.id)} aria-label="Hapus">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredProducts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-gray-500">
                      Tidak ada barang ditemukan
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProduct ? 'Edit Barang' : 'Tambah Barang'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="p-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Nama Barang *</Label>
                <Input {...form.register('nama')} placeholder="Contoh: Semen Tiga Roda 50kg" />
                {form.formState.errors.nama && <p className="text-sm text-red-600">{form.formState.errors.nama.message}</p>}
              </div>
              <div className="space-y-1.5 flex items-end">
                <Label>Kode Barcode</Label>
                <div className="flex gap-2 w-full">
                  <Input {...form.register('kode_barcode')} placeholder="Scan atau ketik barcode" />
                  <Button type="button" variant="outline" onClick={() => { setBarcodeScanTarget('form'); /* TODO: open scanner */ }}>
                    <Barcode className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Supplier</Label>
                <div className="flex gap-2">
                  <Select
                    value={form.watch('supplier')}
                    onValueChange={v => form.setValue('supplier', v)}
                    className="flex-1"
                  >
                    <option value="">Pilih supplier</option>
                    {allSuppliers.map(s => <option key={s} value={s}>{s}</option>)}
                  </Select>
                  <Input
                    placeholder="Atau ketik baru"
                    value={form.watch('supplier')}
                    onChange={e => form.setValue('supplier', e.target.value)}
                    className="w-32"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Satuan *</Label>
                <Input {...form.register('satuan')} placeholder="Contoh: sak, kg, m³, batang, biji, lembar, kaleng, dus" />
                {form.formState.errors.satuan && <p className="text-sm text-red-600">{form.formState.errors.satuan.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Harga Beli (Modal)</Label>
                <Input type="number" min="0" step="100" {...form.register('harga_beli')} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label>Harga Jual *</Label>
                <Input type="number" min="1" step="100" {...form.register('harga_jual')} placeholder="0" />
                {form.formState.errors.harga_jual && <p className="text-sm text-red-600">{form.formState.errors.harga_jual.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Pajak (%)</Label>
                <Input type="number" min="0" max="100" step="1" {...form.register('pajak_persen')} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label>Stok Awal</Label>
                <Input type="number" min="0" step="0.5" {...form.register('stok')} placeholder="0" />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Batal</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {createMutation.isPending || updateMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Menyimpan...
                  </>
                ) : (
                  'Simpan'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <AlertDialog
        open={!!deletingId}
        onOpenChange={open => !open && setDeletingId(null)}
        title="Hapus Barang"
        description="Yakin ingin menghapus barang ini? Tindakan ini tidak bisa dibatalkan."
        onConfirm={() => deletingId && deleteMutation.mutate(deletingId)}
        variant="destructive"
      />

      {/* Import Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Impor Barang dari Excel</DialogTitle>
            <DialogDescription>Upload file .xlsx, .xls, atau .csv</DialogDescription>
          </DialogHeader>
          
          {!importPreview ? (
            <div className="p-4 space-y-4">
              <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center">
                <FileSpreadsheet className="h-12 w-12 mx-auto text-gray-400 mb-2" />
                <p className="text-gray-600 dark:text-gray-400">Seret file ke sini atau klik untuk memilih</p>
                <Input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  onChange={e => e.target.files?.[0] && (setImportFile(e.target.files[0]), handleImport(e.target.files[0]))}
                />
                <Button variant="outline" className="mt-2">Pilih File</Button>
              </div>
              <p className="text-sm text-gray-500 text-center">Format: Nama Barang | Kode Barcode | Supplier | Satuan | Harga Beli | Harga Jual | Pajak (%) | Stok</p>
            </div>
          ) : (
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <p className="text-2xl font-bold text-green-600">{importPreview.baru}</p>
                  <p className="text-sm text-gray-600">Baru</p>
                </div>
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <p className="text-2xl font-bold text-blue-600">{importPreview.diperbarui}</p>
                  <p className="text-sm text-gray-600">Diperbarui</p>
                </div>
                <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                  <p className="text-2xl font-bold text-yellow-600">{importPreview.dilewati}</p>
                  <p className="text-sm text-gray-600">Dilewati</p>
                </div>
              </div>
              
              {importPreview.errors.length > 0 && (
                <div className="max-h-64 overflow-y-auto">
                  <h4 className="font-medium text-red-600 mb-2">Baris dilewati:</h4>
                  <ul className="text-sm text-gray-600 space-y-1">
                    {importPreview.errors.slice(0, 20).map((e: any, i: number) => (
                      <li key={i}>Baris {e.row}: {e.reason}</li>
                    ))}
                    {importPreview.errors.length > 20 && <li>... dan {importPreview.errors.length - 20} baris lainnya</li>}
                  </ul>
                </div>
              )}
              
              <div className="max-h-64 overflow-y-auto">
                <h4 className="font-medium mb-2">Pratinjau data:</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Nama</TableHead>
                      <TableHead>Barcode</TableHead>
                      <TableHead>Satuan</TableHead>
                      <TableHead className="text-right">Harga Jual</TableHead>
                      <TableHead className="text-center">Pajak</TableHead>
                      <TableHead className="text-right">Stok</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importPreview.preview.slice(0, 50).map((p: Product, i: number) => (
                      <TableRow key={i}>
                        <TableCell>
                          <Badge variant={p.id.startsWith('new-') ? 'success' : 'default'}>
                            {p.id.startsWith('new-') ? 'Baru' : 'Update'}
                          </Badge>
                        </TableCell>
                        <TableCell>{p.nama}</TableCell>
                        <TableCell className="font-mono text-sm">{p.kode_barcode || '-'}</TableCell>
                        <TableCell>{p.satuan}</TableCell>
                        <TableCell className="text-right">{formatRupiah(p.harga_jual)}</TableCell>
                        <TableCell className="text-center">{p.pajak_persen}%</TableCell>
                        <TableCell className="text-right">{p.stok}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              
              <DialogFooter>
                <Button variant="outline" onClick={() => { setImportPreview(null); setImportFile(null); }}>Batal</Button>
                <Button onClick={confirmImport} disabled={importPreview.baru === 0 && importPreview.diperbarui === 0}>
                  Lanjutkan Impor
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};