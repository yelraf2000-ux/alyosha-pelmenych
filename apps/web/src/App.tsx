import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import CartPage from './pages/CartPage';
import CatalogPage from './pages/CatalogPage';
import CheckoutPage from './pages/CheckoutPage';
import Home from './pages/Home';
import OrderSuccessPage from './pages/OrderSuccessPage';
import ProductPage from './pages/ProductPage';
import { AboutPage, ContactsPage, DeliveryPage, NotFoundPage } from './pages/TextPages';
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
          <Route path="order/:number" element={<OrderSuccessPage />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="delivery" element={<DeliveryPage />} />
          <Route path="contacts" element={<ContactsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
