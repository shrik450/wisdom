import { Route, Switch, Redirect } from "wouter";
import { Shell } from "./components/shell";
import { ShellActionsProvider } from "./components/shell-actions";
import { WorkspaceView } from "./pages/workspace";

export function App() {
  return (
    <ShellActionsProvider>
      <Shell>
        <Switch>
          <Route path="/">
            <Redirect to="/ws/" />
          </Route>
          <Route path="/ws/*" component={WorkspaceView} />
        </Switch>
      </Shell>
    </ShellActionsProvider>
  );
}
