import { ApiError, DirEntry } from "./types";
import { buildFsApiUrl } from "../path-utils";

export interface FileRangeRequest {
  start?: number;
  end?: number;
  suffixLength?: number;
}

export interface FileRangeResponse {
  text: string;
  byteLength: number;
  status: number;
  contentRange: string | null;
  contentLength: number | null;
}

export interface FileHeadResponse {
  contentLength: number | null;
}

function fsMkdirUrl(path: string): string {
  return `${buildFsApiUrl(path)}?mkdir`;
}

async function checkResponse(res: Response): Promise<void> {
  if (!res.ok) {
    const body = await res.text();
    throw new ApiError(res.status, body);
  }
}

export async function listDir(
  path: string,
  signal?: AbortSignal,
): Promise<DirEntry[]> {
  const res = await fetch(buildFsApiUrl(path), { signal });
  await checkResponse(res);
  return res.json();
}

export async function readFile(
  path: string,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch(buildFsApiUrl(path), { signal });
  await checkResponse(res);
  return res.text();
}

export async function headFile(
  path: string,
  signal?: AbortSignal,
): Promise<FileHeadResponse> {
  const res = await fetch(buildFsApiUrl(path), { method: "HEAD", signal });
  await checkResponse(res);
  return {
    contentLength: parseContentLength(res.headers.get("Content-Length")),
  };
}

function buildRangeHeader(range: FileRangeRequest): string | null {
  if (range.suffixLength !== undefined) {
    return `bytes=-${range.suffixLength}`;
  }
  if (range.start === undefined && range.end === undefined) {
    return null;
  }
  const start = range.start ?? "";
  const end = range.end ?? "";
  return `bytes=${start}-${end}`;
}

function parseContentLength(header: string | null): number | null {
  if (!header) {
    return null;
  }
  const value = Number(header);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export async function readFileRange(
  path: string,
  range: FileRangeRequest,
  signal?: AbortSignal,
): Promise<FileRangeResponse> {
  const headers = new Headers();
  const rangeHeader = buildRangeHeader(range);
  if (rangeHeader) {
    headers.set("Range", rangeHeader);
  }

  const res = await fetch(buildFsApiUrl(path), { headers, signal });
  await checkResponse(res);

  const buffer = await res.arrayBuffer();
  return {
    text: new TextDecoder().decode(buffer),
    byteLength: buffer.byteLength,
    status: res.status,
    contentRange: res.headers.get("Content-Range"),
    contentLength: parseContentLength(res.headers.get("Content-Length")),
  };
}

export async function writeFile(path: string, content: string): Promise<void> {
  const res = await fetch(buildFsApiUrl(path), {
    method: "PUT",
    body: content,
  });
  await checkResponse(res);
}

export async function createDirectory(path: string): Promise<void> {
  const res = await fetch(fsMkdirUrl(path), {
    method: "PUT",
  });
  await checkResponse(res);
}

export async function deleteEntry(path: string, force = false): Promise<void> {
  const res = await fetch(buildFsApiUrl(path), {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ force }),
  });
  await checkResponse(res);
}

export async function moveEntry(
  path: string,
  destination: string,
  force = false,
): Promise<DirEntry> {
  const res = await fetch(buildFsApiUrl(path), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ destination, force }),
  });
  await checkResponse(res);
  return res.json();
}
