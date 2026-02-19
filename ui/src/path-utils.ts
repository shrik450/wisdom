export interface Breadcrumb {
  name: string;
  path: string;
  href: string;
  isCurrent: boolean;
}

function splitPath(path: string): string[] {
  return path.split("/").filter((segment) => segment.length > 0);
}

function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function normalizeWorkspacePath(path: string): string {
  return splitPath(path).join("/");
}

export function joinWorkspacePath(basePath: string, name: string): string {
  const baseSegments = splitPath(basePath);
  return [...baseSegments, name].join("/");
}

export function encodeWorkspacePath(path: string): string {
  return splitPath(path).map(encodeURIComponent).join("/");
}

export function decodeWorkspaceRoutePath(path: string): string {
  return splitPath(path).map(decodePathSegment).join("/");
}

export function buildWorkspaceHref(path: string): string {
  const encodedPath = encodeWorkspacePath(path);
  if (encodedPath === "") {
    return "/ws/";
  }
  return `/ws/${encodedPath}/`;
}

export function buildFsApiUrl(path: string): string {
  const encodedPath = encodeWorkspacePath(path);
  if (encodedPath === "") {
    return "/api/fs/";
  }
  return `/api/fs/${encodedPath}`;
}

export function buildBreadcrumbs(path: string): Breadcrumb[] {
  const normalized = normalizeWorkspacePath(path);
  if (normalized === "") {
    return [];
  }

  const segments = splitPath(normalized);
  return segments.map((segment, index) => {
    const segmentPath = segments.slice(0, index + 1).join("/");
    return {
      name: segment,
      path: segmentPath,
      href: buildWorkspaceHref(segmentPath),
      isCurrent: index === segments.length - 1,
    };
  });
}

export function isSameOrAncestorPath(
  path: string,
  targetPath: string,
): boolean {
  const pathSegments = splitPath(normalizeWorkspacePath(path));
  const targetSegments = splitPath(normalizeWorkspacePath(targetPath));

  if (pathSegments.length > targetSegments.length) {
    return false;
  }

  return pathSegments.every((segment, index) => {
    return segment === targetSegments[index];
  });
}
