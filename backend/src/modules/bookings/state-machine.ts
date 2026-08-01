export type BookingStatus =
  "PENDING" | "CONFIRMED" | "COMPLETED" | "NO_SHOW" | "CANCELLED" | "RESCHEDULED";

const TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["CANCELLED", "COMPLETED", "NO_SHOW", "RESCHEDULED"],
  COMPLETED: [],
  NO_SHOW: [],
  CANCELLED: [],
  RESCHEDULED: [],
};

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return TRANSITIONS[from].includes(to);
}
