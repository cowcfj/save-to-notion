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

  if (!hasMajorAndMinor || numericParts.some(Number.isNaN)) {
    return null;
  }

  return numericParts;
}

function shouldShowUpdateNotification(previousVersion, currentVersion) {
  const prevParts = parseVersionParts(previousVersion);
  const currParts = parseVersionParts(currentVersion);

  if (!prevParts || !currParts) {
    return false;
  }

  if (currParts[0] > prevParts[0]) {
    return true;
  }
  if (currParts[0] < prevParts[0]) {
    return false;
  }

  return currParts[1] > prevParts[1];
}

module.exports = {
  shouldShowUpdateNotification,
};
