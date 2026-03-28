import { registerViewer } from "./registry";
import { directoryViewerRoute } from "./directory-viewer";
import { editorViewerRoute } from "./editor/editor-viewer";
import { plainTextViewerRoute } from "./plain-text-viewer";
import {
  runDirectoryViewerRoute,
  runsDirectoryViewerRoute,
} from "./run-viewers";
import { statViewerRoute } from "./stat-viewer";

// Register built-in viewer routes in a single, explicit place.
registerViewer(runsDirectoryViewerRoute);
registerViewer(runDirectoryViewerRoute);
registerViewer(directoryViewerRoute);
registerViewer(editorViewerRoute);
registerViewer(plainTextViewerRoute);
registerViewer(statViewerRoute);
