import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { debtService, transactionService } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { DebtSummary, DebtPayment } from '@/types';
import { formatRupiah, formatRupiahShort, formatDateTime, normalizePhone, generateWhatsAppLink, cn } from '@/utils/format';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/Card';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/Dialog';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableFooter } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Plus, Send, Phone, Loader2, CreditCard, CheckCircle, XCircle, Search } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

const paymentSchema = z.object({
  pelanggan: z.string().min(1, 'Nama pelanggan wajib diisi'),
  jumlah: z.coerce.number().min(1, 'Jumlah minimal 1'),
});

type PaymentForm = z.infer<typeof paymentSchema>;

export const DebtsPage = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);
  const [payingCustomer, setPayingCustomer] = useState<string | null>(null);

  const { data: debts = [], isLoading, refetch } = useQuery({
    queryKey: ['debts'],
    queryFn: debtService.getSummary,
  });

  const { data: totalOutstanding = 0 } = useQuery({
    queryKey: ['totalOutstanding'],
    queryFn: debtService.getTotalOutstanding,
  });

  const paymentMutation = useMutation({
    mutationFn: (payment: { pelanggan: string; jumlah: number; kasir_id: string }) => debtService.addPayment(payment),
    onSuccess: () => {
      toast.success('Pembayaran hutang dicatat');
      refetch();
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setPayingCustomer(null);
    },
    onError: (error: any) => toast.error(error.message),
  });

  const form = useForm<PaymentForm>({
    resolver: zodResolver(paymentSchema) as any,
    defaultValues: { pelanggan: '', jumlah: 0 },
  });

  const onSubmit = (data: PaymentForm) => {
    if (!payingCustomer) return;
    const debt = debts.find(d => d.pelanggan.toLowerCase() === payingCustomer.toLowerCase());
    if (!debt) return;
    if (data.jumlah > debt.sisa) {
      toast.error(`Jumlah melebihi sisa hutang (${formatRupiah(debt.sisa)})`);
      return;
    }
    paymentMutation.mutate({ ...data, kasir_id: user!.id });
  };

  const openPayment = (customer: string) => {
    const debt = debts.find(d => d.pelanggan.toLowerCase() === customer.toLowerCase());
    if (!debt) return;
    setPayingCustomer(customer);
    form.reset({ pelanggan: customer, jumlah: debt.sisa });
  };

  const sendWhatsAppReminder = (customer: string) => {
    const debt = debts.find(d => d.pelanggan.toLowerCase() === customer.toLowerCase());
    if (!debt) return;
    
    // Get phone number from transactions
    const getPhone = async () => {
      const { data } = await supabase
        .from('transactions')
        .select('no_wa')
        .ilike('pelanggan', customer)
        .not('no_wa', 'is', null)
        .order('waktu', { ascending: false })
        .limit(1)
        .single();
      return data?.no_wa;
    };
    
    getPhone().then(phone => {
      const text = `Halo ${customer}, ini pengingat dari TOko Shidqi Bangunan. Anda memiliki hutang sebesar ${formatRupiah(debt.sisa)}. Mohon untuk segera dilunasi. Terima kasih.`;
      const url = generateWhatsAppLink(phone || '', text);
      window.open(url, '_blank');
    });
  };

  const filteredDebts = debts.filter(d => 
    d.pelanggan.toLowerCase().includes(search.toLowerCase())
  );

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
          <h1 className="text-2xl font-bold">Hutang Pelanggan</h1>
          <p className="text-gray-500">Kelola piutang dan pembayaran</p>
        </div>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Total Belum Lunas</span>
              <span className="text-2xl font-bold text-red-600">{formatRupiahShort(totalOutstanding)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <Input
              placeholder="Cari nama pelanggan..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Debts Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">No</TableHead>
                <TableHead>Pelanggan</TableHead>
                <TableHead className="text-right">Total Hutang</TableHead>
                <TableHead className="text-right">Sudah Bayar</TableHead>
                <TableHead className="text-right">Sisa</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="w-32">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDebts.map((debt, index) => (
                <TableRow key={debt.pelanggan}>
                  <TableCell className="text-center text-sm text-gray-500">{index + 1}</TableCell>
                  <TableCell className="font-medium">{debt.pelanggan}</TableCell>
                  <TableCell className="text-right">{formatRupiah(debt.total_hutang)}</TableCell>
                  <TableCell className="text-right">{formatRupiah(debt.sudah_bayar)}</TableCell>
                  <TableCell className="text-right font-bold text-red-600">{formatRupiah(debt.sisa)}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant={debt.status === 'LUNAS' ? 'success' : 'destructive'}>
                      {debt.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {debt.status !== 'LUNAS' && (
                        <Button variant="outline" size="sm" onClick={() => openPayment(debt.pelanggan)}>
                          <CreditCard className="h-4 w-4 mr-1" /> Bayar
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => sendWhatsAppReminder(debt.pelanggan)} aria-label="Kirim pengingat WA">
                        <Send className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setExpandedCustomer(expandedCustomer === debt.pelanggan ? null : debt.pelanggan)} aria-label="Lihat riwayat">
                        <Phone className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredDebts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                    Tidak ada data hutang
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Payment History for Expanded Customer */}
      {expandedCustomer && (
        <Card>
          <CardHeader className="flex items-center justify-between pb-2">
            <CardTitle>Riwayat Pembayaran: {expandedCustomer}</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setExpandedCustomer(null)}>
              <XCircle className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <DebtHistory customer={expandedCustomer} />
          </CardContent>
        </Card>
      )}

      {/* Payment Dialog */}
      <Dialog open={!!payingCustomer} onOpenChange={open => !open && setPayingCustomer(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Bayar Hutang</DialogTitle>
            <DialogDescription>Pelanggan: {payingCustomer}</DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="p-4 space-y-4">
            <div className="space-y-1.5">
              <Label>Jumlah Bayar (Rp)</Label>
              <Input type="number" min="1" step="1000" {...form.register('jumlah')} />
              {form.formState.errors.jumlah && <p className="text-sm text-red-600">{form.formState.errors.jumlah.message}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPayingCustomer(null)}>Batal</Button>
              <Button type="submit" disabled={paymentMutation.isPending}>
                {paymentMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Memproses...
                  </>
                ) : (
                  'Catat Pembayaran'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const DebtHistory = ({ customer }: { customer: string }) => {
  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['debtPayments', customer],
    queryFn: () => debtService.getPayments(customer),
  });

  if (isLoading) {
    return <div className="flex justify-center py-4"><div className="animate-spin rounded-full h-8 w-8 border-4 border-primary border-t-transparent" /></div>;
  }

  return (
    <div className="space-y-2">
      {payments.length === 0 ? (
        <p className="text-gray-500 text-center py-4">Belum ada pembayaran</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">No</TableHead>
              <TableHead>Tanggal</TableHead>
              <TableHead className="text-right">Jumlah</TableHead>
              <TableHead>Kasir</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((payment, index) => (
              <TableRow key={payment.id}>
                <TableCell className="text-center text-sm text-gray-500">{index + 1}</TableCell>
                <TableCell>{formatDateTime(payment.waktu)}</TableCell>
                <TableCell className="text-right font-medium text-green-600">{formatRupiah(payment.jumlah)}</TableCell>
                <TableCell>{payment.kasir_nama || payment.kasir_id}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={2} className="font-bold">Total</TableCell>
              <TableCell className="text-right font-bold text-green-600">{formatRupiah(payments.reduce((s, p) => s + p.jumlah, 0))}</TableCell>
              <TableCell></TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      )}
    </div>
  );
};