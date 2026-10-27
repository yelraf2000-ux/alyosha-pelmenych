ALTER TABLE "custom_orders" ADD COLUMN "price_amd" integer;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "preorder_qty" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "is_preorder" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "badges" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "custom_orders" ADD CONSTRAINT "custom_orders_price_non_negative" CHECK ("custom_orders"."price_amd" IS NULL OR "custom_orders"."price_amd" >= 0);--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_preorder_within_qty" CHECK ("order_items"."preorder_qty" >= 0 AND "order_items"."preorder_qty" <= "order_items"."qty");