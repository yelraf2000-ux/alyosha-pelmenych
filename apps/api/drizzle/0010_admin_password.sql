CREATE TABLE "admin_password" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"password_hash" text,
	"configured_fingerprint" text,
	"reset_token_hash" text,
	"reset_expires_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_password_single_row" CHECK ("admin_password"."id" = 1)
);
