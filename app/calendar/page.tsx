import type { Metadata } from "next";
import MonthlyCalendar from "@/components/calendar/MonthlyCalendar";

export const metadata: Metadata = {
  title: "Calendar",
  description: "A month view of completed ADDit tasks.",
};

export default function CalendarPage() {
  return <MonthlyCalendar />;
}
