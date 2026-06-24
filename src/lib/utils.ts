import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Merges Tailwind class names, resolving conflicts via tailwind-merge so that
 * later classes always win (e.g. `cn('p-2', 'p-4')` → `'p-4'`).
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  'auth/invalid-email':                          'That doesn\'t look like a valid email address.',
  'auth/user-not-found':                         'No account found with that email.',
  'auth/wrong-password':                         'Incorrect password. Please try again.',
  'auth/invalid-credential':                     'Incorrect email or password.',
  'auth/email-already-in-use':                   'An account with this email already exists.',
  'auth/weak-password':                          'Password is too weak. Use at least 8 characters with mixed case and numbers.',
  'auth/user-disabled':                          'This account has been disabled. Contact your administrator.',
  'auth/too-many-requests':                      'Too many failed attempts. Please wait a moment and try again.',
  'auth/network-request-failed':                 'Network error. Check your connection and try again.',
  'auth/popup-closed-by-user':                   'Sign-in popup was closed. Please try again.',
  'auth/popup-blocked':                          'Popup was blocked by your browser. Please allow popups for this site.',
  'auth/cancelled-popup-request':                '',
  'auth/account-exists-with-different-credential': 'An account already exists with a different sign-in method for this email.',
  'auth/operation-not-allowed':                  'This sign-in method is not enabled. Contact your administrator.',
  'auth/requires-recent-login':                  'Please sign out and sign back in before making this change.',
  'auth/credential-already-in-use':             'These credentials are already linked to another account.',
  'auth/missing-email':                          'Please enter an email address.',
  'auth/invalid-action-code':                    'This reset link has expired or already been used. Request a new one.',
  'auth/expired-action-code':                    'This reset link has expired. Please request a new one.',
}

/**
 * Converts a Firebase Auth error into a user-readable message.
 * Falls back to a generic message for codes not in the lookup table.
 * Note: 'auth/cancelled-popup-request' intentionally maps to '' so the UI
 * stays silent when the user simply dismisses a popup.
 */
export function getAuthErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? ''
  const mapped = AUTH_ERROR_MESSAGES[code]
  if (mapped !== undefined) return mapped
  return 'Something went wrong. Please try again.'
}
