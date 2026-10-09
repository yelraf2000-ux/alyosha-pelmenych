// The storefront talks to the backend only through these functions.
// A normal build uses the real API; the demo build (VITE_DEMO=1) uses the in-browser stand-in.

import * as http from './http';
import * as mock from './mock';

export const IS_DEMO = import.meta.env.VITE_DEMO === '1';

const api = IS_DEMO ? mock : http;

export const getProducts = api.getProducts;
export const getCategories = api.getCategories;
export const getSettings = api.getSettings;
export const submitOrder = api.submitOrder;
export const submitCustomOrder = api.submitCustomOrder;
export const createStockRequest = api.createStockRequest;
export const resetDemo = mock.resetDemo;
