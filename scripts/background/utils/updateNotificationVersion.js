function parseVersionParts(version) {
  if (typeof version !== 'string') {
    return null;
  }

  const parts = version.split('.');
  const hasMajorAndMinor = parts.length >= 2;

  if (!hasMajorAndMinor || parts.some(part => !/^\d+$/.test(part))) {
    return null;
  }

  return parts.map(Number);
}

function shouldShowUpdateNotification(previousVersion, currentVersion) {
  const previousParts = parseVersionParts(previousVersion);
  const currentParts = parseVersionParts(currentVersion);

  if (!previousParts || !currentParts) {
    return false;
  }

  if (currentParts[0] > previousParts[0]) {
    return true;
  }
  if (currentParts[0] < previousParts[0]) {
    return false;
  }

  return currentParts[1] > previousParts[1];
}

export { shouldShowUpdateNotification };
