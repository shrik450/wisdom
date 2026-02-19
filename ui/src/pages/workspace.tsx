import { useParams } from "wouter";
import { decodeWorkspaceRoutePath } from "../path-utils";

export function WorkspaceView() {
  const params = useParams<{ "*": string }>();
  const path = decodeWorkspaceRoutePath(params["*"] ?? "");

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">Workspace</h1>
      <p className="mt-2 text-txt-muted">/{path}</p>
    </div>
  );
}
