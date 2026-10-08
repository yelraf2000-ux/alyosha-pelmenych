ALTER TABLE "orders" ADD COLUMN "delivery_extra" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- The courier fee of 1 000 ֏ was our guess: the shop has no fixed price. 0 means "paid to the
-- courier separately" (the site says «+ доставка»). Only the guessed value is changed, so a fee
-- the owner has set himself stays.
UPDATE "settings" SET "value" = '0' WHERE "key" = 'courier_fee_amd' AND "value" = '1000';
