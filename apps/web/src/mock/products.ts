import type { Product } from '../types';

// Products for the static demo build: the real names and prices from Алексей's price list.
// Stock and the «Новинка» marks are made up, chosen to show every card state
// (in stock, low stock, out of stock); the demo banner says the data are examples.

type MockProduct = Pick<Product, 'slug' | 'name' | 'category' | 'priceAmd' | 'weightLabel' | 'stockQty'> & {
  isNew?: boolean;
};

const PRICE_LIST: MockProduct[] = [
  { slug: 'pelmeni-kurinye-iz-bedra', name: 'Пельмени куриные из бедра', category: 'pelmeni', priceAmd: 2300, weightLabel: '500 г', stockQty: 12 },
  { slug: 'pelmeni-kurinye-slivochno-syrnye', name: 'Пельмени куриные сливочно-сырные', category: 'pelmeni', priceAmd: 2700, weightLabel: '500 г', stockQty: 8 },
  { slug: 'pelmeni-kurinye-s-krevetkoy', name: 'Пельмени куриные с креветкой', category: 'pelmeni', priceAmd: 3500, weightLabel: '500 г', stockQty: 3, isNew: true },
  { slug: 'pelmeni-govyazhi', name: 'Пельмени говяжьи', category: 'pelmeni', priceAmd: 3300, weightLabel: '500 г', stockQty: 10 },
  { slug: 'pelmeni-govyazhi-s-zelenyu', name: 'Пельмени говяжьи с зеленью', category: 'pelmeni', priceAmd: 3400, weightLabel: '500 г', stockQty: 0 },
  { slug: 'manty-kurinye', name: 'Манты куриные', category: 'manty', priceAmd: 2000, weightLabel: '6 шт.', stockQty: 6 },
  { slug: 'manty-govyazhi', name: 'Манты говяжьи', category: 'manty', priceAmd: 2500, weightLabel: '6 шт.', stockQty: 0 },
  { slug: 'hinkali-govyazhi', name: 'Хинкали говяжьи', category: 'khinkali', priceAmd: 3300, weightLabel: '6 шт.', stockQty: 5 },
  { slug: 'hinkali-svino-govyazhi', name: 'Хинкали свино-говяжьи', category: 'khinkali', priceAmd: 3000, weightLabel: '6 шт.', stockQty: 9, isNew: true },
];

export const MOCK_PRODUCTS: Product[] = PRICE_LIST.map((product, index) => ({
  id: index + 1,
  description: '',
  isNew: false,
  isActive: true,
  sortOrder: (index + 1) * 10,
  imagePath: `/products/${product.slug}-1000.webp`, // built by scripts/product-art/build.mjs
  videoPath: null,
  ...product,
}));
