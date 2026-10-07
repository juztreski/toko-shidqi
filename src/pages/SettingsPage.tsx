import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userService, settingsService } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { formatRupiah } from '@/utils/format';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/Card';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/Dialog';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { Switch } from '@/components/ui/Switch';
import { Separator } from '@/components/ui/Separator';
import { Select } from '@/components/ui/Select';
import { Plus, Edit, Trash2, Download, Database, Loader2, AlertCircle, CheckCircle, Shield, UserPlus, Key, Building2, RotateCcw, FileSpreadsheet } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import { productService, transactionService } from '@/services/api';

const userSchema = z.object({
  email: z.string().email('Format email tidak valid'),
  password: z.string().min(6, 'Password minimal 6 karakter'),
  full_name: z.string().min(1, 'Nama lengkap wajib diisi'),
  role: z.enum(['owner', 'kasir']),
});

type UserForm = z.infer<typeof userSchema>;

const settingsSchema = z.object({
  nama_toko: z.string().min(1, 'Nama toko wajib diisi'),
  alamat_toko: z.string().min(1, 'Alamat toko wajib diisi'),
  terapkan_pajak_struk: z.boolean(),
});

type SettingsForm = z.infer<typeof settingsSchema>;

export const SettingsPage = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>('users');
  const [editingUser, setEditingUser] = useState<any>(null);
  const [showResetConfirm1, setShowResetConfirm1] = useState(false);
  const [showResetConfirm2, setShowResetConfirm2] = useState(false);
  const [resetText, setResetText] = useState('');

  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ['users'],
    queryFn: userService.getAll,
  });

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsService.get,
  });

  const createUserMutation = useMutation({
    mutationFn: userService.create,
    onSuccess: () => {
      toast.success('Akun kasir berhasil dibuat');
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setEditingUser(null);
    },
    onError: (error: any) => toast.error(error.message),
  });

  const updateUserMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => userService.update(id, data),
    onSuccess: () => {
      toast.success('Akun berhasil diperbarui');
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setEditingUser(null);
    },
    onError: (error: any) => toast.error(error.message),
  });

  const updateSettingsMutation = useMutation({
    mutationFn: settingsService.update,
    onSuccess: (data) => {
      toast.success('Pengaturan toko disimpan');
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (error: any) => toast.error(error.message),
  });

  const userForm = useForm<UserForm>({
    resolver: zodResolver(userSchema),
    defaultValues: { email: '', password: '', full_name: '', role: 'kasir' },
  });

  const settingsForm = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    defaultValues: { nama_toko: '', alamat_toko: '', terapkan_pajak_struk: false },
  });

  useEffect(() => {
    if (settings) {
      settingsForm.reset({
        nama_toko: settings.nama_toko,
        alamat_toko: settings.alamat_toko,
        terapkan_pajak_struk: settings.terapkan_pajak_struk,
      });
    }
  }, [settings, settingsForm]);

  const openCreateUser = () => {
    userForm.reset({ email: '', password: '', full_name: '', role: 'kasir' });
    setEditingUser(null);
  };

  const openEditUser = (u: any) => {
    userForm.reset({
      email: u.email,
      password: '',
      full_name: u.full_name || '',
      role: u.role,
    });
    setEditingUser(u);
  };

  const onUserSubmit = (data: UserForm) => {
    if (editingUser) {
      updateUserMutation.mutate({ id: editingUser.user_id, data: { full_name: data.full_name, role: data.role } });
    } else {
      createUserMutation.mutate(data);
    }
  };

  const onSettingsSubmit = (data: SettingsForm) => {
    updateSettingsMutation.mutate(data);
  };

  const exportAllData = async () => {
    try {
      const [products, transactions, items, debts, users, settings] = await Promise.all([
        productService.getAll(),
        transactionService.getAll(),
        supabase.from('transaction_items').select('*'),
        supabase.from('debt_payments').select('*'),
        userService.getAll(),
        settingsService.get(),
      ]);

      const wb = XLSX.utils.book_new();

      // Products
      const prodHeaders = ['Nama Barang', 'Kode Barcode', 'Supplier', 'Satuan', 'Harga Beli', 'Harga Jual', 'Pajak (%)', 'Stok'];
      const prodData = products.map(p => [p.nama, p.kode_barcode || '', p.supplier || '', p.satuan, p.harga_beli || 0, p.harga_jual, p.pajak_persen, p.stok]);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([prodHeaders, ...prodData]), 'Barang');

      // Transactions
      const txHeaders = ['No Struk', 'Tanggal', 'Pelanggan', 'No WA', 'Metode', 'Subtotal', 'Diskon', 'Ongkir', 'Total', 'Dibayar', 'Hutang', 'Kasir ID'];
      const txData = transactions.map(t => [t.no_struk, t.waktu, t.pelanggan, t.no_wa || '', t.metode, t.subtotal, t.diskon, t.ongkir, t.total, t.dibayar, t.hutang, t.kasir_id]);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([txHeaders, ...txData]), 'Transaksi');

      // Transaction Items
      const itemHeaders = ['Transaksi ID', 'Nama', 'Satuan', 'Harga Jual', 'Harga Beli', 'Qty'];
      const itemData = (items.data || []).map((i: any) => [i.transaksi_id, i.nama, i.satuan, i.harga_jual, i.harga_beli || 0, i.qty]);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([itemHeaders, ...itemData]), 'Detail Barang');

      // Debt Payments
      const dpHeaders = ['Pelanggan', 'Jumlah', 'Waktu', 'Kasir ID'];
      const dpData = (debts.data || []).map((d: any) => [d.pelanggan, d.jumlah, d.waktu, d.kasir_id]);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([dpHeaders, ...dpData]), 'Pembayaran Hutang');

      // Users
      const userHeaders = ['User ID', 'Email', 'Nama Lengkap', 'Role', 'Aktif', 'Dibuat'];
      const userData = users.map(u => [u.user_id, u.email, u.full_name || '', u.role, u.is_active ? 'Ya' : 'Tidak', u.created_at]);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([userHeaders, ...userData]), 'Users');

      // Settings
      const setHeaders = ['Nama Toko', 'Alamat Toko', 'Terapkan Pajak Struk'];
      const setData = [[settings.nama_toko, settings.alamat_toko, settings.terapkan_pajak_struk ? 'Ya' : 'Tidak']];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([setHeaders, ...setData]), 'Pengaturan');

      XLSX.writeFile(wb, `backup_shidqi_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('Backup data berhasil diekspor');
    } catch (error) {
      toast.error('Gagal ekspor backup: ' + (error as Error).message);
    }
  };

  const handleReset = async () => {
    if (resetText !== 'RESET') {
      toast.error('Ketik "RESET" untuk konfirmasi');
      return;
    }

    try {
      // Call reset_all_data RPC
      const { error } = await supabase.rpc('reset_all_data');
      if (error) throw error;
      
      toast.success('Semua data berhasil direset. Halaman akan dimuat ulang...');
      setTimeout(() => window.location.reload(), 1500);
    } catch (error) {
      toast.error('Gagal reset data: ' + (error as Error).message);
    }
  };

  const currentUserId = user?.id;

  if (usersLoading || settingsLoading) {
    return (
      <div className="flex h-[calc(100vh-8rem)] items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Setelan</h1>
        <p className="text-gray-500">Kelola akun, pengaturan toko, dan data</p>
      </div>

      <Tabs defaultValue="users" value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="users">
            <Shield className="h-4 w-4 mr-2" />
            Akun Kasir
          </TabsTrigger>
          <TabsTrigger value="store">
            <Building2 className="h-4 w-4 mr-2" />
            Toko & Pajak
          </TabsTrigger>
          <TabsTrigger value="backup">
            <Database className="h-4 w-4 mr-2" />
            Backup & Reset
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Akun Kasir */}
        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Daftar Akun</CardTitle>
              <Button onClick={openCreateUser}>
                <UserPlus className="h-4 w-4 mr-2" />
                Tambah Kasir
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Nama Lengkap</TableHead>
                    <TableHead>Peran</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Dibuat</TableHead>
                    <TableHead className="w-24">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map(u => (
                    <TableRow key={u.user_id}>
                      <TableCell>{u.email}</TableCell>
                      <TableCell>{u.full_name || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={u.role === 'owner' ? 'default' : 'secondary'}>
                          {u.role === 'owner' ? 'Pemilik' : 'Kasir'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={u.is_active ? 'success' : 'destructive'}>
                          {u.is_active ? 'Aktif' : 'Nonaktif'}
                        </Badge>
                      </TableCell>
                      <TableCell>{new Date(u.created_at).toLocaleDateString('id-ID')}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {u.user_id !== currentUserId && (
                            <>
                              <Button variant="ghost" size="icon" onClick={() => openEditUser(u)} aria-label="Edit">
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="text-red-600" 
                                onClick={() => updateUserMutation.mutate({ id: u.user_id, data: { is_active: !u.is_active } })}
                                aria-label={u.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                              >
                                {u.is_active ? <RotateCcw className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                              </Button>
                            </>
                          )}
                          {u.user_id === currentUserId && (
                            <Badge variant="outline" className="text-xs">Anda</Badge>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Add/Edit User Dialog */}
          <Dialog open={!!editingUser || userForm.formState.isDirty} onOpenChange={open => { if (!open) { setEditingUser(null); userForm.reset({ email: '', password: '', full_name: '', role: 'kasir' }); } }}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{editingUser ? 'Edit Akun' : 'Tambah Akun Kasir'}</DialogTitle>
                <DialogDescription>{editingUser ? 'Perbarui data akun kasir' : 'Buat akun kasir baru dengan email dan password'}</DialogDescription>
              </DialogHeader>
              <form onSubmit={userForm.handleSubmit(onUserSubmit)} className="p-4 space-y-4">
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input type="email" {...userForm.register('email')} disabled={!!editingUser} placeholder="kasir@toko.com" />
                  {userForm.formState.errors.email && <p className="text-sm text-red-600">{userForm.formState.errors.email.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>{editingUser ? 'Password Baru (kosongkan jika tidak diubah)' : 'Password'}</Label>
                  <Input type="password" {...userForm.register('password')} placeholder={editingUser ? 'Biarkan kosong' : 'Minimal 6 karakter'} />
                  {userForm.formState.errors.password && <p className="text-sm text-red-600">{userForm.formState.errors.password.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Nama Lengkap</Label>
                  <Input {...userForm.register('full_name')} placeholder="Nama kasir" />
                  {userForm.formState.errors.full_name && <p className="text-sm text-red-600">{userForm.formState.errors.full_name.message}</p>}
                </div>
                {!editingUser && (
                  <div className="space-y-1.5">
                    <Label>Peran</Label>
                    <Select value={userForm.watch('role')} onValueChange={v => userForm.setValue('role', v as 'owner' | 'kasir')}>
                      <option value="kasir">Kasir</option>
                      <option value="owner">Pemilik</option>
                    </Select>
                  </div>
                )}
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => { setEditingUser(null); userForm.reset({ email: '', password: '', full_name: '', role: 'kasir' }); }}>Batal</Button>
                  <Button type="submit" disabled={createUserMutation.isPending || updateUserMutation.isPending}>
                    {createUserMutation.isPending || updateUserMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Menyimpan...
                      </>
                    ) : (
                      editingUser ? 'Simpan Perubahan' : 'Buat Akun'
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Tab 2: Toko & Pajak */}
        <TabsContent value="store" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Informasi Toko</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={settingsForm.handleSubmit(onSettingsSubmit)} className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Nama Toko</Label>
                  <Input {...settingsForm.register('nama_toko')} placeholder="TOKO SHIDQI BANGUNAN" />
                </div>
                <div className="space-y-1.5">
                  <Label>Alamat Toko</Label>
                  <Input {...settingsForm.register('alamat_toko')} placeholder="Jalan H.Muh Tang Labokong" />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-1.5">
                    <Label>Terapkan Pajak di Struk</Label>
                    <p className="text-sm text-gray-500">Jika aktif, pajak akan ditampilkan di struk (belum mempengaruhi total)</p>
                  </div>
                  <Switch
                    checked={settingsForm.watch('terapkan_pajak_struk')}
                    onCheckedChange={v => settingsForm.setValue('terapkan_pajak_struk', v)}
                  />
                </div>
                <div className="pt-4 border-t">
                  <Button type="submit" disabled={updateSettingsMutation.isPending}>
                    {updateSettingsMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Menyimpan...
                      </>
                    ) : (
                      'Simpan Pengaturan'
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Backup & Reset */}
        <TabsContent value="backup" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                Backup Data
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-gray-600">Unduh seluruh data toko dalam format Excel (multi-sheet): Barang, Transaksi, Detail Barang, Pembayaran Hutang, Users, Pengaturan.</p>
              <Button onClick={exportAllData} variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Unduh Backup Excel
              </Button>
            </CardContent>
          </Card>

          <Card className="border-red-200 dark:border-red-900/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-600">
                <AlertCircle className="h-5 w-5" />
                Reset Semua Data
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                <p className="font-medium text-red-800 dark:text-red-200 mb-2">⚠️ PERINGATAN: Tindakan ini tidak bisa dibatalkan!</p>
                <ul className="text-sm text-red-700 dark:text-red-300 space-y-1 list-disc list-inside">
                  <li>Semua data barang, transaksi, hutang, dan akun kasir akan DIHAPUS</li>
                  <li>Hanya akun pemilik (anda) yang tersisa</li>
                  <li>Data barang akan dikembalikan ke 20 barang contoh default</li>
                  <li>Pengaturan toko dikembalikan ke default</li>
                </ul>
              </div>
              
              {/* Step 1 */}
              <AlertDialog
                open={showResetConfirm1}
                onOpenChange={setShowResetConfirm1}
                title="Konfirmasi Reset Data"
                description="Yakin ingin menghapus SEMUA data transaksi, barang, hutang, dan akun kasir? Tindakan ini permanen."
                confirmText="Ya, lanjutkan"
                cancelText="Batal"
                onConfirm={() => { setShowResetConfirm1(false); setShowResetConfirm2(true); }}
                variant="destructive"
              />
              
              {/* Step 2 */}
              <AlertDialog
                open={showResetConfirm2}
                onOpenChange={setShowResetConfirm2}
                title="Konfirmasi Final - Ketik RESET"
                description="Untuk memastikan, silakan ketik kata 'RESET' (huruf besar) di bawah ini:"
                confirmText="RESET SEMUA DATA"
                cancelText="Batal"
                onConfirm={handleReset}
                variant="destructive"
              >
                <Input
                  value={resetText}
                  onChange={e => setResetText(e.target.value)}
                  placeholder="Ketik RESET di sini"
                  className="mt-4 text-center text-lg font-mono"
                  maxLength={5}
                />
              </AlertDialog>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowResetConfirm1(true)}>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reset Data
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};