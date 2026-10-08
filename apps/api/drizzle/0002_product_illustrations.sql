-- Give the products from the price list their picture (apps/web/public/products/<slug>-1000.webp,
-- built by scripts/product-art/build.mjs).
-- Only where no picture is set, so a real photo uploaded in the admin is never replaced.
UPDATE "products"
SET "image_path" = '/products/' || "slug" || '-1000.webp', "updated_at" = now()
WHERE "image_path" IS NULL
  AND "slug" IN (
    'pelmeni-kurinye-iz-bedra',
    'pelmeni-kurinye-slivochno-syrnye',
    'pelmeni-kurinye-s-krevetkoy',
    'pelmeni-govyazhi',
    'pelmeni-govyazhi-s-zelenyu',
    'manty-kurinye',
    'manty-govyazhi',
    'hinkali-govyazhi',
    'hinkali-svino-govyazhi'
  );
