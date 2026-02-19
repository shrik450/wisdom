import { ApiError, DirEntry } from "./types";
import { buildFsApiUrl } from "../path-utils";

function fsUrl(path: string): string {
  return buildFsApiUrl(path);
}

async function checkResponse(res: Response): Promise<void> {
  if (!res.ok) {
    const body = await res.text();
    throw new ApiError(res.status, body);
  }
}

export async function listDir(path: string): Promise<DirEntry[]> {
  const res = await fetch(fsUrl(path));
  await checkResponse(res);
  return res.json();
}

export async function readFile(path: string): Promise<string> {
  const res = await fetch(fsUrl(path));
  await checkResponse(res);
  return res.text();
}

export async function writeFile(path: string, content: string): Promise<void> {
  const res = await fetch(fsUrl(path), {
    method: "PUT",
    body: content,
  });
  await checkResponse(res);
}

export async function deleteEntry(path: string, force = false): Promise<void> {
  const res = await fetch(fsUrl(path), {
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
  const res = await fetch(fsUrl(path), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ destination, force }),
  });
  await checkResponse(res);
  return res.json();
}
