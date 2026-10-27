CREATE TYPE "public"."promo_kind" AS ENUM('percent', 'amount');--> statement-breakpoint
CREATE TABLE "promo_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"kind" "promo_kind" NOT NULL,
	"value" integer NOT NULL,
	"categories" text[] DEFAULT '{}'::text[] NOT NULL,
	"product_ids" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"max_uses" integer,
	"valid_until" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promo_codes_code_unique" UNIQUE("code"),
	CONSTRAINT "promo_codes_value_positive" CHECK ("promo_codes"."value" > 0),
	CONSTRAINT "promo_codes_percent_at_most_100" CHECK ("promo_codes"."kind" <> 'percent' OR "promo_codes"."value" <= 100),
	CONSTRAINT "promo_codes_max_uses_positive" CHECK ("promo_codes"."max_uses" IS NULL OR "promo_codes"."max_uses" > 0)
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "promo_code_id" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "promo_code" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "discount_amd" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_promo_code_id_promo_codes_id_fk" FOREIGN KEY ("promo_code_id") REFERENCES "public"."promo_codes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_promo_code_idx" ON "orders" USING btree ("promo_code_id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_discount_non_negative" CHECK ("orders"."discount_amd" >= 0);