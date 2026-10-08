-- Categories stop being a fixed list in the code: they move into a table the owner can add to.
CREATE TABLE "categories" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
-- The five that existed as the product_category type, under the names the site showed for them.
INSERT INTO "categories" ("slug", "name", "sort_order") VALUES
	('pelmeni', 'Пельмени', 10),
	('vareniki', 'Вареники', 20),
	('manty', 'Манты', 30),
	('khinkali', 'Хинкали', 40),
	('other', 'Другое', 50);
--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "category" SET DATA TYPE text USING "category"::text;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_categories_slug_fk" FOREIGN KEY ("category") REFERENCES "public"."categories"("slug") ON DELETE no action ON UPDATE cascade;--> statement-breakpoint
DROP TYPE "public"."product_category";
