import { redirect } from "next/navigation";

export default function ArchivePage() {
  redirect("/settings#archived");
}
