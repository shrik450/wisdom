import { Route, Switch, Redirect } from "wouter";
import { Shell } from "./components/shell";
import { ShellActionsProvider } from "./components/shell-actions";
import { WorkspaceEntryProvider } from "./hooks/use-workspace-entry-info";
import { WorkspaceMutatedProvider } from "./hooks/use-workspace-mutated";
import { WorkspaceView } from "./pages/workspace";
import "./viewers";

export function App() {
  return (
    <WorkspaceMutatedProvider>
      <ShellActionsProvider>
        <WorkspaceEntryProvider>
          <Shell>
            <Switch>
              <Route path="/">
                <Redirect to="/ws/" />
              </Route>
              <Route path="/ws/*" component={WorkspaceView} />
            </Switch>
          </Shell>
        </WorkspaceEntryProvider>
      </ShellActionsProvider>
    </WorkspaceMutatedProvider>
  );
}
