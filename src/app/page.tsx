import { redirect } from 'next/navigation'

/**
 * Root route (`/`). Immediately redirects to the dashboard so the app always
 * opens at a meaningful landing page rather than a blank root URL.
 */
export default function Home() {
  redirect('/dashboard')
}
