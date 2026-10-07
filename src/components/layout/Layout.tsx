import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Avatar, AvatarFallback } from '@/components/ui/Avatar';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/DropdownMenu';
import { LayoutDashboard, Package, Box, CreditCard, BarChart3, History, Settings, LogOut, User, Shield } from 'lucide-react';
import { cn } from '@/utils/format';
import { useState } from 'react';

const navigation = [
  { name: 'Kasir', href: '/', icon: LayoutDashboard, roles: ['owner', 'kasir'] },
  { name: 'Barang', href: '/barang', icon: Package, roles: ['owner'] },
  { name: 'Stok', href: '/stok', icon: Box, roles: ['owner', 'kasir'] },
  { name: 'Hutang', href: '/hutang', icon: CreditCard, roles: ['owner', 'kasir'] },
  { name: 'Laporan', href: '/laporan', icon: BarChart3, roles: ['owner'] },
  { name: 'Riwayat', href: '/riwayat', icon: History, roles: ['owner', 'kasir'] },
  { name: 'Setelan', href: '/setelan', icon: Settings, roles: ['owner'] },
];

export const Layout = () => {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const filteredNav = navigation.filter(item => item.roles.includes(user?.role || ''));

  return (
    <div className="min-h-screen bg-cream-50 dark:bg-gray-900 transition-colors">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 dark:bg-gray-800 dark:border-gray-700',
          'transform transition-transform duration-200 lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center justify-between px-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                <Package className="h-5 w-5 text-white" />
              </div>
              <span className="font-bold text-lg text-gray-900 dark:text-white">TOKO SHIDQI</span>
            </div>
            <button
              className="lg:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              onClick={() => setSidebarOpen(false)}
              aria-label="Tutup menu"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1 overflow-y-auto" role="navigation" aria-label="Menu utama">
            {filteredNav.map((item) => {
              const isActive = location.pathname === item.href || (item.href !== '/' && location.pathname.startsWith(item.href));
              return (
                <NavLink
                  key={item.name}
                  to={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors touch-manipulation',
                    isActive
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                  )}
                  onClick={() => setSidebarOpen(false)}
                >
                  <item.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                  {item.name}
                </NavLink>
              );
            })}
          </nav>

          {/* User info */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <DropdownMenu>
              <DropdownMenuTrigger className="w-full justify-start gap-3">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="text-sm font-medium bg-primary text-white">
                    {user?.full_name?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 text-left min-w-0">
                  <p className="text-sm font-medium truncate">{user?.full_name || 'User'}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{user?.role}</p>
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="font-normal">{user?.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => { setUserMenuOpen(false); alert('Fitur profil belum tersedia'); }}>
                  <User className="h-4 w-4 mr-2" /> Profil
                </DropdownMenuItem>
                {user?.role === 'owner' && (
                  <DropdownMenuItem onClick={() => { setUserMenuOpen(false); alert('Fitur manajemen user di halaman Setelan'); }}>
                    <Shield className="h-4 w-4 mr-2" /> Manajemen User
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async () => { setUserMenuOpen(false); await signOut(); }}
                  className="text-red-600 focus:text-red-600"
                >
                  <LogOut className="h-4 w-4 mr-2" /> Keluar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Mobile header */}
        <header className="lg:hidden sticky top-0 z-30 h-16 bg-white border-b border-gray-200 dark:bg-gray-800 dark:border-gray-700">
          <div className="flex h-full items-center justify-between px-4">
            <button
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              onClick={() => setSidebarOpen(true)}
              aria-label="Buka menu"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="font-bold text-lg text-gray-900 dark:text-white">TOKO SHIDQI</span>
            <div className="w-10" />
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-6" role="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
};