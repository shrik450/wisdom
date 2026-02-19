export interface DirEntry {
  name: string;
  size: number;
  modTime: string;
  isDir: boolean;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`API error ${status}: ${body}`);
    this.name = "ApiError";
  }
}
