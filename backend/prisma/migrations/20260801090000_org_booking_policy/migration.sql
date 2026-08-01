-- Notice period and booking horizon were hardcoded in the availability
-- service. They are business policy, not a constant, so they move onto the
-- organisation. Defaults match the previous hardcoded values, so existing
-- organisations behave exactly as they did before this ran.
ALTER TABLE "Organization" ADD COLUMN "minNoticeMinutes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Organization" ADD COLUMN "bookingHorizonDays" INTEGER NOT NULL DEFAULT 30;
