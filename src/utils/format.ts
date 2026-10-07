import { format as formatDateFns, parseISO, isValid } from 'date-fns';
import { id } from 'date-fns/locale';

export const formatRupiah = (value: number): string => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

export const formatRupiahShort = (value: number): string => {
  return `Rp${new Intl.NumberFormat('id-ID').format(value)}`;
};

export const parseRupiah = (value: string): number => {
  return Number(value.replace(/[^0-9,-]/g, '').replace(',', '.')) || 0;
};

export const formatDate = (date: string | Date): string => {
  const d = typeof date === 'string' ? parseISO(date) : date;
  if (!isValid(d)) return '-';
  return formatDateFns(d, 'dd MMMM yyyy', { locale: id });
};

export const formatDateTime = (date: string | Date): string => {
  const d = typeof date === 'string' ? parseISO(date) : date;
  if (!isValid(d)) return '-';
  return formatDateFns(d, 'dd MMM yyyy HH:mm', { locale: id });
};

export const formatTime = (date: string | Date): string => {
  const d = typeof date === 'string' ? parseISO(date) : date;
  if (!isValid(d)) return '-';
  return formatDateFns(d, 'HH:mm', { locale: id });
};

export const formatDateInput = (date: string | Date): string => {
  const d = typeof date === 'string' ? parseISO(date) : date;
  if (!isValid(d)) return '';
  return formatDateFns(d, 'yyyy-MM-dd');
};

export const normalizePhone = (phone: string): string => {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.slice(1);
  } else if (cleaned.startsWith('8')) {
    cleaned = '62' + cleaned;
  } else if (cleaned.startsWith('62')) {
    // already correct
  } else if (cleaned.startsWith('+62')) {
    cleaned = cleaned.slice(1);
  }
  return cleaned;
};

export const generateWhatsAppLink = (phone: string, text: string): string => {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  }
  return `https://wa.me/${normalized}?text=${encodeURIComponent(text)}`;
};

export const generateStructText = (transaction: any, settings: any): string => {
  const { items, ...t } = transaction;
  let text = `*${settings.nama_toko}*\n`;
  text += `${settings.alamat_toko}\n\n`;
  text += `STRUK: ${String(t.no_struk).padStart(4, '0')}\n`;
  text += `${formatDateTime(t.waktu)}\n`;
  text += `Pelanggan: ${t.pelanggan}\n`;
  if (t.no_wa) text += `WA: ${t.no_wa}\n`;
  text += `------------------------------\n`;
  
  items?.forEach((item: any) => {
    const subtotal = item.harga_jual * item.qty;
    text += `${item.nama}\n`;
    text += `${item.qty} ${item.satuan} x ${formatRupiahShort(item.harga_jual)} = ${formatRupiahShort(subtotal)}\n`;
  });
  
  text += `------------------------------\n`;
  text += `Subtotal: ${formatRupiahShort(t.subtotal)}\n`;
  if (t.diskon > 0) text += `Diskon: -${formatRupiahShort(t.diskon)}\n`;
  if (t.ongkir > 0) text += `Ongkir: +${formatRupiahShort(t.ongkir)}\n`;
  text += `*TOTAL: ${formatRupiahShort(t.total)}*\n`;
  text += `Bayar (${t.metode}): ${formatRupiahShort(t.dibayar)}\n`;
  if (t.metode === 'Tunai' && t.dibayar > t.total) {
    text += `Kembali: ${formatRupiahShort(t.dibayar - t.total)}\n`;
  }
  if (t.hutang > 0) {
    text += `*SISA HUTANG: ${formatRupiahShort(t.hutang)}*\n`;
    text += `*BELUM LUNAS*\n`;
  }
  text += `\nTerima kasih telah berbelanja!`;
  return text;
};

export const generateReceiptHtml = (transaction: any, settings: any): string => {
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
        <div><span>Tanggal:</span> <span class="right">${new Date(t.waktu).toLocaleString('id-ID')}</span></div>
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

export const cn = (...classes: (string | undefined | null | false)[]): string => {
  return classes.filter(Boolean).join(' ');
};