const TEXT_MIME_PREFIXES = ["text/"];

const TEXT_LIKE_MIME_TYPES = new Set([
  "application/json",
  "application/xml",
  "application/javascript",
  "application/typescript",
  "application/toml",
  "application/yaml",
  "application/x-sh",
  "application/x-httpd-php",
  "application/graphql",
  "application/sql",
]);

export function isTextContentType(contentType: string | null): boolean {
  if (!contentType) {
    return false;
  }
  for (const prefix of TEXT_MIME_PREFIXES) {
    if (contentType.startsWith(prefix)) {
      return true;
    }
  }
  return TEXT_LIKE_MIME_TYPES.has(contentType);
}

export function isLikelyTextFallback(
  contentType: string | null,
  extension: string | null,
): boolean {
  return contentType === "application/octet-stream" && extension === null;
}
