-- Two people can't hold the same staff member's time simultaneously.
-- Narrows the double-booking race window; the actual guarantee (I1) is
-- Booking_no_overlap alone.
ALTER TABLE "Hold" ADD CONSTRAINT "Hold_no_overlap"
  EXCLUDE USING gist (
    "staffMemberId" WITH =,
    tstzrange("startsAt", "endsAt", '[)') WITH &&
  );
