-- Where the bot's «Написать Алёше» button leads: the Telegram account the owner answers buyers from.
-- Set only if nothing has been entered in «Настройки → Ваш личный Telegram» yet.
INSERT INTO "settings" ("key", "value") VALUES ('telegram_contact', 'whosit')
ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value" WHERE "settings"."value" = '';
