function shouldShowUpdateNotification(previousVersion, currentVersion) {
  if (!previousVersion || !currentVersion) {
    return false;
  }

  const prevParts = previousVersion.split('.').map(Number);
  const currParts = currentVersion.split('.').map(Number);

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
