CREATE TYPE "public"."expense_unit" AS ENUM('kg', 'g', 'l', 'ml', 'pcs');--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"qty" double precision NOT NULL,
	"unit" "expense_unit" NOT NULL,
	"amount_amd" integer NOT NULL,
	"spent_on" date DEFAULT CURRENT_DATE NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expenses_qty_positive" CHECK ("expenses"."qty" > 0),
	CONSTRAINT "expenses_amount_non_negative" CHECK ("expenses"."amount_amd" >= 0)
);
--> statement-breakpoint
CREATE INDEX "expenses_spent_on_idx" ON "expenses" USING btree ("spent_on","id");