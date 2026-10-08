import { plural } from '../lib/format';

export const ru = {
  brand: 'Алёша Пельменыч',
  loading: 'Загружаем…',
  loadError: 'Не получилось загрузить каталог. Обновите страницу.',
  close: 'Закрыть',

  demo: {
    text: 'Демо-версия: фото, тексты и цены — примеры.',
    reset: 'Сбросить демо',
  },

  nav: {
    home: 'Главная',
    catalog: 'Каталог',
    about: 'О нас',
    delivery: 'Доставка и оплата',
    contacts: 'Контакты',
    cart: 'Корзина',
    main: 'Основное меню',
    breadcrumbs: 'Вы здесь',
  },

  categories: {
    all: 'Все',
    pelmeni: 'Пельмени',
    vareniki: 'Вареники',
    manty: 'Манты',
    khinkali: 'Хинкали',
    other: 'Другое',
  },

  home: {
    newTitle: 'Новинки',
    catalogTitle: 'Каталог',
    aboutTitle: 'О нас',
    aboutMore: 'Подробнее о нас',
    deliveryTitle: 'Доставка',
  },

  catalog: {
    title: 'Каталог',
    filterLabel: 'Категория',
    empty: 'В этой категории пока ничего нет.',
  },

  product: {
    addToCart: 'В корзину',
    added: 'Добавлено',
    awaiting: 'Ожидается поставка',
    notify: 'Сообщить о поступлении',
    isNew: 'Новинка',
    inStock: 'В наличии',
    left: (n: number) => `Осталось ${n} шт.`,
    inCart: (n: number) => `В корзине: ${n} шт.`,
    allInCart: 'Больше нет',
    qty: 'Количество',
    decrease: 'Меньше',
    increase: 'Больше',
    photoPlaceholder: 'PLACEHOLDER · фото',
    notFoundTitle: 'Такого товара нет',
    notFoundText: 'Возможно, он закончился или ссылка устарела.',
    toCatalog: 'В каталог',
    description: 'Описание',
    video: 'Видео',
  },

  notify: {
    title: 'Сообщить о поступлении',
    text: (name: string) => `Оставьте контакты — мы напишем или позвоним, когда «${name}» снова появится.`,
    submit: 'Отправить',
    sending: 'Отправляем…',
    doneTitle: 'Спасибо!',
    doneText: 'Мы сообщим вам, когда товар появится.',
    error: 'Не получилось отправить. Попробуйте ещё раз.',
  },

  cart: {
    title: 'Корзина',
    emptyTitle: 'В корзине пока пусто',
    emptyText: 'Загляните в каталог — там пельмени, манты и хинкали.',
    removeItem: (name: string) => `Убрать «${name}» из корзины`,
    subtotal: 'Товары',
    delivery: 'Доставка',
    total: 'Итого',
    pickup: 'Самовывоз',
    courier: 'Курьер',
    free: 'Бесплатно',
    /** Where a courier fee would stand when the shop has no fixed one. */
    deliveryExtra: '+ доставка',
    deliveryExtraNote: 'Доставку до этой суммы вы оплачиваете курьеру отдельно',
    plusDelivery: (sum: string) => `${sum} + доставка`,
    freeFrom: (sum: string) => `Бесплатная доставка от ${sum}`,
    untilFree: (sum: string) => `До бесплатной доставки осталось ${sum}`,
    deliveryIsFree: 'Доставка бесплатная!',
    checkout: 'Оформить заказ',
    adjusted: 'На складе осталось меньше, чем было в корзине, — мы поправили количество.',
    maxReached: (n: number) => `Больше нет: в наличии ${n} шт.`,
    count: (n: number) => `${n} ${plural(n, ['товар', 'товара', 'товаров'])}`,
    sticky: 'Корзина',
  },

  form: {
    name: 'Имя',
    phone: 'Телефон',
    phoneHint: 'Например: +374 91 123456',
    telegram: 'Telegram',
    comment: 'Комментарий',
    optional: 'необязательно',
    errors: {
      name: 'Напишите, как к вам обращаться',
      phone: 'Проверьте номер. Формат: +374 91 123456',
      telegram: 'Проверьте имя в Telegram, например @username',
      address: 'Укажите адрес доставки',
    },
  },

  checkout: {
    title: 'Оформление заказа',
    contactsTitle: 'Ваши контакты',
    methodTitle: 'Способ получения',
    pickup: 'Самовывоз',
    courier: 'Доставка курьером',
    pickupAddress: 'Адрес самовывоза',
    address: 'Адрес доставки',
    addressHint: 'Улица, дом, квартира, подъезд',
    courierFee: (sum: string) => `Доставка — ${sum}`,
    courierFree: 'Доставка бесплатно',
    courierExtra: 'Доставку оплачиваете курьеру отдельно',
    summaryTitle: 'Ваш заказ',
    submit: 'Отправить заказ',
    submitting: 'Отправляем…',
    noPayment: 'Оплата на сайте не нужна — мы свяжемся с вами и всё уточним.',
    fixErrors: 'Проверьте поля, отмеченные красным.',
    shortageTitle: 'Пока вы оформляли заказ, часть товаров раскупили',
    shortageLeft: (name: string, n: number) => `${name}: осталось только ${n} шт.`,
    shortageNone: (name: string) => `${name}: закончились`,
    shortageHint: 'Мы обновили корзину. Проверьте заказ и отправьте ещё раз.',
    failed: 'Не получилось отправить заказ. Попробуйте ещё раз.',
    rateLimited: 'Слишком много попыток. Попробуйте через несколько минут.',
    backToCart: 'Вернуться в корзину',
    hp: 'Не заполняйте это поле',
  },

  success: {
    title: 'Заказ принят!',
    text: 'Мы свяжемся с вами в ближайшее время.',
    toHome: 'На главную',
    toCatalog: 'В каталог',
    noOrder: 'Спасибо за заказ! Мы свяжемся с вами в ближайшее время.',
  },

  delivery: {
    pickupTitle: 'Самовывоз',
    courierTitle: 'Курьер',
    courierFreeFrom: (sum: string) => `Бесплатно при заказе от ${sum}.`,
    courierExtraBelow: 'До этой суммы доставка оплачивается отдельно.',
  },

  contacts: {
    phone: 'Телефон',
    telegram: 'Telegram',
    instagram: 'Instagram',
    tiktok: 'TikTok',
    menu: 'Контакты',
  },

  about: {
    photoAlt: 'Алексей с миской начинки для пельменей',
  },

  footer: {
    madeBy: 'Разработка сайта —',
  },

  notFound: {
    title: 'Страница не найдена',
    text: 'Такой страницы нет. Зато есть пельмени.',
  },
};
