import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import CartPage from './pages/CartPage';
import CatalogPage from './pages/CatalogPage';
import CheckoutPage from './pages/CheckoutPage';
import Home from './pages/Home';
import OrderSuccessPage from './pages/OrderSuccessPage';
import ProductPage from './pages/ProductPage';
import { AboutPage, NotFoundPage } from './pages/TextPages';
import { CartProvider } from './state/CartContext';
import { ShopProvider } from './state/ShopContext';

// The admin panel is a separate chunk: buyers never download it.
const AdminApp = lazy(() => import('./admin/AdminApp'));

function Storefront() {
  return (
    <ShopProvider>
      <CartProvider>
        <Layout />
      </CartProvider>
    </ShopProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route
          path="admin/*"
          element={
            <Suspense fallback={null}>
              <AdminApp />
            </Suspense>
          }
        />
        <Route element={<Storefront />}>
          <Route index element={<Home />} />
          <Route path="catalog" element={<CatalogPage />} />
          <Route path="product/:slug" element={<ProductPage />} />
          <Route path="cart" element={<CartPage />} />
          <Route path="checkout" element={<CheckoutPage />} />
          <Route path="order/:any" element={<OrderSuccessPage />} />
          <Route path="about" element={<AboutPage />} />
          {/* These two used to be pages of their own; what they said is on the home page and in the footer. */}
          <Route path="delivery" element={<Navigate to="/" replace />} />
          <Route path="contacts" element={<Navigate to="/" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
