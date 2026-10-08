import type { Product } from '../types';

// PLACEHOLDER data for the Phase 0 prototype.
// TODO_CLIENT: every name, description, weight, price and stock number below is an example.
// Stock values are chosen to show each card state: in stock, low stock (≤ 3), out of stock.

const PLACEHOLDER_DESCRIPTION =
  'PLACEHOLDER: здесь будет описание — состав, вкус, как готовить. Текст пришлёт Алексей.';

export const MOCK_PRODUCTS: Product[] = [
  {
    id: 1,
    slug: 'pelmeni-domashnie',
    name: 'Пельмени домашние', // TODO_CLIENT
    description: PLACEHOLDER_DESCRIPTION,
    category: 'pelmeni',
    priceAmd: 2400, // TODO_CLIENT
    weightLabel: '500 г', // TODO_CLIENT
    stockQty: 12,
    isNew: false,
    isActive: true,
    sortOrder: 10,
    imagePath: null, // PLACEHOLDER photo
  },
  {
    id: 2,
    slug: 'pelmeni-s-govyadinoy',
    name: 'Пельмени с говядиной', // TODO_CLIENT
    description: PLACEHOLDER_DESCRIPTION,
    category: 'pelmeni',
    priceAmd: 2600, // TODO_CLIENT
    weightLabel: '500 г', // TODO_CLIENT
    stockQty: 3,
    isNew: true,
    isActive: true,
    sortOrder: 20,
    imagePath: null, // PLACEHOLDER photo
  },
  {
    id: 3,
    slug: 'vareniki-s-kartoshkoy',
    name: 'Вареники с картошкой', // TODO_CLIENT
    description: PLACEHOLDER_DESCRIPTION,
    category: 'vareniki',
    priceAmd: 1800, // TODO_CLIENT
    weightLabel: '500 г', // TODO_CLIENT
    stockQty: 8,
    isNew: false,
    isActive: true,
    sortOrder: 30,
    imagePath: null, // PLACEHOLDER photo
  },
  {
    id: 4,
    slug: 'vareniki-s-vishney',
    name: 'Вареники с вишней', // TODO_CLIENT
    description: PLACEHOLDER_DESCRIPTION,
    category: 'vareniki',
    priceAmd: 2000, // TODO_CLIENT
    weightLabel: '500 г', // TODO_CLIENT
    stockQty: 0,
    isNew: true,
    isActive: true,
    sortOrder: 40,
    imagePath: null, // PLACEHOLDER photo
  },
  {
    id: 5,
    slug: 'manty',
    name: 'Манты', // TODO_CLIENT
    description: PLACEHOLDER_DESCRIPTION,
    category: 'manty',
    priceAmd: 3200, // TODO_CLIENT
    weightLabel: '800 г', // TODO_CLIENT
    stockQty: 5,
    isNew: false,
    isActive: true,
    sortOrder: 50,
    imagePath: null, // PLACEHOLDER photo
  },
  {
    id: 6,
    slug: 'manty-s-tykvoy',
    name: 'Манты с тыквой', // TODO_CLIENT
    description: PLACEHOLDER_DESCRIPTION,
    category: 'manty',
    priceAmd: 3000, // TODO_CLIENT
    weightLabel: '800 г', // TODO_CLIENT
    stockQty: 0,
    isNew: false,
    isActive: true,
    sortOrder: 60,
    imagePath: null, // PLACEHOLDER photo
  },
];
