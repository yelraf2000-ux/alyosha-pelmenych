CREATE SEQUENCE "public"."custom_order_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "custom_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"public_number" text DEFAULT 'R-' || lpad(nextval('custom_order_number_seq')::text, 4, '0') NOT NULL,
	"recipe_name" text NOT NULL,
	"base" text NOT NULL,
	"modifiers" text[] NOT NULL,
	"spices" text[] NOT NULL,
	"weight_grams" integer NOT NULL,
	"customer_name" text NOT NULL,
	"customer_phone" text NOT NULL,
	"customer_telegram" text,
	"comment" text,
	"status" "order_status" DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "custom_orders_public_number_unique" UNIQUE("public_number")
);
--> statement-breakpoint
CREATE INDEX "custom_orders_status_created_idx" ON "custom_orders" USING btree ("status","created_at");
--> statement-breakpoint
-- «Свой рецепт»: the options a buyer chooses from, one per line. The shop starts with the lists
-- Алексей sent; he edits them in the admin. An existing value is never overwritten.
INSERT INTO "settings" ("key", "value") VALUES
	('custom_bases', array_to_string(ARRAY['Говядина', 'Свинина', 'Свинина + говядина', 'Куриное бедро', 'Куриная грудка', 'Бедро + грудка'], chr(10))),
	('custom_modifiers', array_to_string(ARRAY['Сливочное масло', 'Сливки', 'Шампиньоны', 'Сладкий перец', 'Острый перец', 'Кабачок', 'Морковь', 'Репчатый лук', 'Жареный лук', 'Зелёный лук', 'Креветка', 'Чеснок', 'Кинза', 'Петрушка'], chr(10))),
	('custom_spices', array_to_string(ARRAY['Меньше соли', 'Без соли', 'Чёрный перец', 'Кориандр', 'Паприка', 'Сушёный чеснок', 'Хмели-сунели', 'Итальянские травы'], chr(10)))
ON CONFLICT ("key") DO NOTHING;
