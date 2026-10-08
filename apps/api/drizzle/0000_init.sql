CREATE TYPE "public"."delivery_method" AS ENUM('pickup', 'courier');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('new', 'confirmed', 'done', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."product_category" AS ENUM('pelmeni', 'vareniki', 'manty', 'other');--> statement-breakpoint
CREATE TYPE "public"."stock_request_status" AS ENUM('open', 'notified', 'closed');--> statement-breakpoint
CREATE SEQUENCE "public"."order_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"product_name_snapshot" text NOT NULL,
	"price_amd_snapshot" integer NOT NULL,
	"qty" integer NOT NULL,
	CONSTRAINT "order_items_qty_positive" CHECK ("order_items"."qty" > 0)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"public_number" text DEFAULT 'A-' || lpad(nextval('order_number_seq')::text, 4, '0') NOT NULL,
	"customer_name" text NOT NULL,
	"customer_phone" text NOT NULL,
	"customer_telegram" text,
	"comment" text,
	"delivery_method" "delivery_method" NOT NULL,
	"delivery_address" text,
	"items_total_amd" integer NOT NULL,
	"delivery_fee_amd" integer NOT NULL,
	"total_amd" integer NOT NULL,
	"status" "order_status" DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_public_number_unique" UNIQUE("public_number"),
	CONSTRAINT "orders_courier_has_address" CHECK ("orders"."delivery_method" <> 'courier' OR "orders"."delivery_address" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category" "product_category" NOT NULL,
	"price_amd" integer NOT NULL,
	"weight_label" text DEFAULT '' NOT NULL,
	"stock_qty" integer DEFAULT 0 NOT NULL,
	"is_new" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"image_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_slug_unique" UNIQUE("slug"),
	CONSTRAINT "products_stock_qty_non_negative" CHECK ("products"."stock_qty" >= 0),
	CONSTRAINT "products_price_amd_non_negative" CHECK ("products"."price_amd" >= 0)
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"telegram" text,
	"status" "stock_request_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_requests" ADD CONSTRAINT "stock_requests_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "orders_status_created_idx" ON "orders" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "stock_requests_product_status_idx" ON "stock_requests" USING btree ("product_id","status");