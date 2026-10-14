import { useState } from "react";
import { Outlet, Link, useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Package, 
  Users, 
  Settings, 
  LogOut, 
  ClipboardList, 
  Monitor, 
  Truck, 
  FileText, 
  Receipt, 
  BarChart2, 
  Database, 
  Printer, 
  Menu, 
  X 
} from "lucide-react";
import { useAuthStore } from "../features/auth/auth.store";
import { invoke } from "@tauri-apps/api/core";

export function MainLayout() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, token, clearAuth, hasPermission } = useAuthStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const getPageTitle = () => {
    const path = location.pathname;
    if (path === '/') return t('dashboard');
    if (path.startsWith('/sales')) return t('sales');
    if (path.startsWith('/pos')) return t('posBilling');
    if (path.startsWith('/products')) return t('products');
    if (path.startsWith('/inventory')) return t('inventory');
    if (path.startsWith('/suppliers')) return t('suppliers');
    if (path.startsWith('/purchase-orders')) return t('purchaseOrders');
    if (path.startsWith('/purchases')) return t('purchases');
    if (path.startsWith('/reports')) return t('reports');
    if (path.startsWith('/settings/metadata')) return t('metadataSettings');
    if (path.startsWith('/settings/backup-restore')) return t('backupRestore');
    if (path.startsWith('/settings/hardware')) return t('hardware');
    return t('dashboard');
  };

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    i18n.changeLanguage(e.target.value);
  };

  const handleLogout = async () => {
    if (token) {
      try {
        await invoke("logout", { token });
      } catch (e) {
        console.error("Logout error", e);
      }
    }
    clearAuth();
    navigate("/login");
  };

  const isActive = (path: string) => {
    if (path === '/' && location.pathname !== '/') return false;
    return location.pathname.startsWith(path);
  };

  const getLinkClass = (path: string) => {
    return `flex items-center space-x-3 px-4 py-3 rounded-lg font-medium transition-colors ${
      isActive(path) 
        ? "text-blue-600 bg-blue-50 font-semibold" 
        : "text-gray-700 hover:bg-gray-50 active:bg-gray-100"
    }`;
  };

  const getPosLinkClass = (path: string) => {
    return `flex items-center space-x-3 px-4 py-3 rounded-lg font-bold transition-colors ${
      isActive(path)
        ? "text-white bg-blue-700 shadow-sm"
        : "text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800"
    }`;
  };

  const closeMobileMenu = () => setMobileMenuOpen(false);

  const NavigationItems = () => (
    <>
      {hasPermission("dashboard.view") && (
        <Link to="/" onClick={closeMobileMenu} className={getLinkClass("/")}>
          <LayoutDashboard size={20} />
          <span>{t('dashboard')}</span>
        </Link>
      )}
      {hasPermission("sales.view") && (
        <Link to="/sales" onClick={closeMobileMenu} className={getLinkClass("/sales")}>
          <ShoppingCart size={20} />
          <span>{t('sales')}</span>
        </Link>
      )}
      {hasPermission("sales.create") && (
        <Link to="/pos" onClick={closeMobileMenu} className={getPosLinkClass("/pos")}>
          <Monitor size={20} />
          <span>{t('posBilling')}</span>
        </Link>
      )}
      {hasPermission("products.view") && (
        <Link to="/products" onClick={closeMobileMenu} className={getLinkClass("/products")}>
          <Package size={20} />
          <span>{t('products')}</span>
        </Link>
      )}
      {hasPermission("inventory.view") && (
        <Link to="/inventory" onClick={closeMobileMenu} className={getLinkClass("/inventory")}>
          <ClipboardList size={20} />
          <span>{t('inventory')}</span>
        </Link>
      )}
      {hasPermission("suppliers.view") && (
        <Link to="/suppliers" onClick={closeMobileMenu} className={getLinkClass("/suppliers")}>
          <Truck size={20} />
          <span>{t('suppliers')}</span>
        </Link>
      )}
      {hasPermission("purchases.view") && (
        <Link to="/purchase-orders" onClick={closeMobileMenu} className={getLinkClass("/purchase-orders")}>
          <FileText size={20} />
          <span>{t('purchaseOrders')}</span>
        </Link>
      )}
      {hasPermission("purchases.view") && (
        <Link to="/purchases" onClick={closeMobileMenu} className={getLinkClass("/purchases")}>
          <Receipt size={20} />
          <span>{t('purchases')}</span>
        </Link>
      )}
      {hasPermission("sales.view") && (
        <Link to="/reports" onClick={closeMobileMenu} className={getLinkClass("/reports")}>
          <BarChart2 size={20} />
          <span>{t('reports')}</span>
        </Link>
      )}
      {hasPermission("customers.view") && (
        <div className="flex items-center space-x-3 text-gray-400 px-4 py-3 rounded-lg font-medium cursor-not-allowed" title="Not implemented yet">
          <Users size={20} />
          <span>{t('customers')} (WIP)</span>
        </div>
      )}
      {hasPermission("products.create") && (
        <Link to="/settings/metadata" onClick={closeMobileMenu} className={getLinkClass("/settings/metadata")}>
          <Settings size={20} />
          <span>{t('metadataSettings')}</span>
        </Link>
      )}
      {hasPermission("backup.view") && (
        <Link to="/settings/backup-restore" onClick={closeMobileMenu} className={getLinkClass("/settings/backup-restore")}>
          <Database size={20} />
          <span>{t('backupRestore')}</span>
        </Link>
      )}
      {hasPermission("hardware.view") && (
        <Link to="/settings/hardware" onClick={closeMobileMenu} className={getLinkClass("/settings/hardware")}>
          <Printer size={20} />
          <span>{t('hardware')}</span>
        </Link>
      )}
    </>
  );

  return (
    <div className="flex h-screen bg-gray-100 font-sans text-gray-900 select-none overflow-hidden">
      {/* Desktop Sidebar (lg and up) */}
      <aside className="hidden lg:flex w-64 bg-white border-r border-gray-200 flex-col shrink-0">
        <div className="h-16 flex items-center justify-between px-6 border-b border-gray-200">
          <h1 className="text-xl font-bold text-blue-600 tracking-tight">IR POS</h1>
          <span className="text-xs font-semibold px-2 py-0.5 bg-blue-100 text-blue-800 rounded">v1.0</span>
        </div>
        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
          <NavigationItems />
        </nav>
        <div className="p-4 border-t border-gray-200">
          <button 
            onClick={handleLogout} 
            className="flex w-full items-center justify-center space-x-2 text-red-600 hover:bg-red-50 active:bg-red-100 px-4 py-2.5 rounded-lg font-medium transition-colors"
          >
            <LogOut size={20} />
            <span>{t('logout')}</span>
          </button>
        </div>
      </aside>

      {/* Mobile Drawer (Backdrop + Slide-over) */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div 
            className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
            onClick={closeMobileMenu}
          />
          <aside className="relative flex flex-col w-72 max-w-[85vw] bg-white h-full shadow-2xl z-10">
            <div className="h-16 flex items-center justify-between px-5 border-b border-gray-200">
              <h1 className="text-xl font-bold text-blue-600">IR POS</h1>
              <button 
                onClick={closeMobileMenu}
                className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                aria-label="Close Menu"
              >
                <X size={22} />
              </button>
            </div>
            <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
              <NavigationItems />
            </nav>
            <div className="p-4 border-t border-gray-200 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
              <button 
                onClick={handleLogout} 
                className="flex w-full items-center justify-center space-x-2 text-red-600 hover:bg-red-50 px-4 py-2.5 rounded-lg font-medium transition-colors"
              >
                <LogOut size={20} />
                <span>{t('logout')}</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Topbar */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 sm:px-6 shrink-0 pt-[env(safe-area-inset-top,0px)]">
          <div className="flex items-center space-x-3">
            {/* Mobile Hamburger Button */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 text-gray-700 hover:bg-gray-100 active:bg-gray-200 rounded-lg focus:outline-hidden"
              aria-label="Open Navigation Menu"
            >
              <Menu size={24} />
            </button>
            <h2 className="text-lg sm:text-xl font-semibold text-gray-800 truncate">
              {getPageTitle()}
            </h2>
          </div>

          <div className="flex items-center space-x-2 sm:space-x-4">
            <select
              value={i18n.language}
              onChange={handleLanguageChange}
              className="px-2.5 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 bg-white transition-colors cursor-pointer outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="en">English</option>
              <option value="si">සිංහල</option>
              <option value="ta">தமிழ்</option>
            </select>
            <div className="flex items-center space-x-2 pl-1 sm:pl-2">
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm uppercase shadow-xs">
                {user?.username.charAt(0) || 'U'}
              </div>
              <span className="hidden sm:inline font-medium text-sm text-gray-700">{user?.username || 'User'}</span>
            </div>
          </div>
        </header>

        {/* Page Content Viewport */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-6 bg-gray-50 select-text pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
