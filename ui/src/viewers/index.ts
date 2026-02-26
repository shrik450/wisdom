import { registerViewer } from "./registry";
import { directoryViewerRoute } from "./directory-viewer";
import { plainTextViewerRoute } from "./plain-text-viewer";
import { statViewerRoute } from "./stat-viewer";

// Register built-in viewer routes in a single, explicit place.
registerViewer(directoryViewerRoute);
registerViewer(plainTextViewerRoute);
registerViewer(statViewerRoute);
