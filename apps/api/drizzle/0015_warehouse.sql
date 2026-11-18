CREATE TYPE "public"."ingredient_unit" AS ENUM('g', 'ml', 'pcs');--> statement-breakpoint
CREATE TABLE "ingredient_purchases" (
	"id" serial PRIMARY KEY NOT NULL,
	"ingredient_id" integer NOT NULL,
	"qty" double precision NOT NULL,
	"paid_amd" integer NOT NULL,
	"purchased_on" date DEFAULT CURRENT_DATE NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ingredient_purchases_qty_positive" CHECK ("ingredient_purchases"."qty" > 0),
	CONSTRAINT "ingredient_purchases_paid_non_negative" CHECK ("ingredient_purchases"."paid_amd" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ingredients" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"unit" "ingredient_unit" NOT NULL,
	"stock_qty" double precision DEFAULT 0 NOT NULL,
	"unit_cost_amd" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ingredients_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "product_ingredients" (
	"product_id" integer NOT NULL,
	"ingredient_id" integer NOT NULL,
	"qty" double precision NOT NULL,
	CONSTRAINT "product_ingredients_product_id_ingredient_id_pk" PRIMARY KEY("product_id","ingredient_id"),
	CONSTRAINT "product_ingredients_qty_positive" CHECK ("product_ingredients"."qty" > 0)
);
--> statement-breakpoint
ALTER TABLE "custom_orders" ADD COLUMN "cost_amd" integer;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "unit_cost_amd" integer;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "ingredients" jsonb;--> statement-breakpoint
ALTER TABLE "ingredient_purchases" ADD CONSTRAINT "ingredient_purchases_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_ingredients" ADD CONSTRAINT "product_ingredients_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_ingredients" ADD CONSTRAINT "product_ingredients_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ingredient_purchases_date_idx" ON "ingredient_purchases" USING btree ("purchased_on","id");--> statement-breakpoint
ALTER TABLE "custom_orders" ADD CONSTRAINT "custom_orders_cost_non_negative" CHECK ("custom_orders"."cost_amd" IS NULL OR "custom_orders"."cost_amd" >= 0);