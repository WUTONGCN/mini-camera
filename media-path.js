const { pathToFileURL } = require('node:url');

const WINDOWS_DRIVE_PATH_PATTERN = /^[a-zA-Z]:[\\/]/;
const WINDOWS_UNC_PATH_PATTERN = /^\\\\[^\\]+\\[^\\]/;

function encodePathSegments(filePath) {
  return filePath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function buildMediaFileUrl(filePath) {
  if (WINDOWS_DRIVE_PATH_PATTERN.test(filePath)) {
    const normalizedPath = filePath.replace(/\\/g, '/');
    const drive = normalizedPath.slice(0, 2);
    const rest = normalizedPath.slice(2);

    return `file:///${drive}${encodePathSegments(rest)}`;
  }

  if (WINDOWS_UNC_PATH_PATTERN.test(filePath)) {
    const [host, ...pathSegments] = filePath.replace(/\\/g, '/').slice(2).split('/');

    return `file://${host}/${pathSegments.map((segment) => encodeURIComponent(segment)).join('/')}`;
  }

  return pathToFileURL(filePath).href;
}

module.exports = {
  buildMediaFileUrl
};
