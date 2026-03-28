import { ApiError } from "./types";

export interface CreateRunRequest {
  path: string;
  args?: string[];
  cwd?: string;
  trigger?: string;
}

export interface CreateRunResponse {
  id: string;
  path: string;
  requestPath: string;
  statePath: string;
  outputPath: string;
}

async function checkResponse(res: Response): Promise<void> {
  if (!res.ok) {
    const body = await res.text();
    throw new ApiError(res.status, body);
  }
}

export async function createRun(
  request: CreateRunRequest,
): Promise<CreateRunResponse> {
  const res = await fetch("/api/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  await checkResponse(res);
  return res.json();
}

export async function cancelRun(id: string): Promise<void> {
  const res = await fetch(`/api/runs/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
  });
  await checkResponse(res);
}
