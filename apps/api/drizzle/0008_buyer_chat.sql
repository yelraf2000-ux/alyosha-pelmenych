ALTER TABLE "custom_orders" ADD COLUMN "notify_token" text;--> statement-breakpoint
ALTER TABLE "custom_orders" ADD COLUMN "telegram_chat_id" bigint;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "notify_token" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "telegram_chat_id" bigint;--> statement-breakpoint
ALTER TABLE "custom_orders" ADD CONSTRAINT "custom_orders_notify_token_unique" UNIQUE("notify_token");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_notify_token_unique" UNIQUE("notify_token");