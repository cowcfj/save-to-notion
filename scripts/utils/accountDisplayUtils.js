const DEFAULT_AVATAR_FALLBACK_INITIAL = '?';

/**
 * Resolve account profile display fields shared by popup and options UI.
 *
 * @param {{ email?: string|null, displayName?: string|null }|null|undefined} profile
 * @returns {{
 *   normalizedDisplayName: string,
 *   email: string,
 *   displayLabel: string,
 *   avatarFallbackInitial: string,
 * }}
 */
export function resolveAccountDisplayProfile(profile) {
  const normalizedDisplayName =
    typeof profile?.displayName === 'string' ? profile.displayName.trim() : '';
  const email = typeof profile?.email === 'string' ? profile.email : '';
  const displayLabel = normalizedDisplayName || email;
  const avatarFallbackInitial = displayLabel
    ? displayLabel.charAt(0).toUpperCase()
    : DEFAULT_AVATAR_FALLBACK_INITIAL;

  return {
    normalizedDisplayName,
    email,
    displayLabel,
    avatarFallbackInitial,
  };
}
