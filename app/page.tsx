import { redirect } from "next/navigation";

/**
 * There is no public landing page: `/` always resolves to the dashboard, and
 * Proxy sends signed-out visitors to `/login` before this ever renders.
 */
export default function Home() {
  redirect("/dashboard");
}
