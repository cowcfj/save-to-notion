function parseVersionParts(version) {
  if (typeof version !== 'string') {
    return null;
  }

  const parts = version.split('.');
  const hasMajorAndMinor = parts.length >= 2;
  const numericParts = parts.map(part => {
    if (!/^\d+$/.test(part)) {
      return NaN;
    }
    return Number(part);
  });

  if (!hasMajorAndMinor || numericParts.some(part => Number.isNaN(part))) {
    return null;
  }

  return numericParts;
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
