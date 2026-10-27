CREATE TABLE "news_posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"image_path" text,
	"video_path" text,
	"published_on" date DEFAULT CURRENT_DATE NOT NULL,
	"is_published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "news_posts_published_idx" ON "news_posts" USING btree ("published_on","id");