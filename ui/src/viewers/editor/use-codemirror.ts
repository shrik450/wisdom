import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  Compartment,
  EditorState,
  Text,
  type Extension,
} from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
} from "@codemirror/language";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { normalizedExtension, resolveLanguage } from "./language";
import {
  blockCursorTheme,
  wisdomEditorTheme,
  wisdomHighlightStyle,
} from "./theme";
import {
  editorModeField,
  keySuppression,
  setEditorMode,
  type EditorMode,
} from "./key-suppression";

interface UseCodemirrorOptions {
  containerRef: RefObject<HTMLDivElement | null>;
  initialDoc: string | null;
  extension: string | null;
  contentType: string | null;
}

interface UseCodemirrorResult {
  view: EditorView | null;
  getDoc: () => string;
  markClean: () => void;
  reload: (content: string) => void;
  dirty: boolean;
  cursorLine: number;
  cursorCol: number;
  setMode: (mode: EditorMode) => void;
  toggleWrap: () => void;
  toggleLineNumbers: () => void;
  goToLine: (line: number) => void;
}

function shouldWrapByDefault(
  extension: string | null,
  contentType: string | null,
): boolean {
  const normalized = normalizedExtension(extension);
  if (normalized === "md" || normalized === "markdown") {
    return true;
  }

  return resolveLanguage(extension, contentType) === null;
}

export function useCodemirror({
  containerRef,
  initialDoc,
  extension,
  contentType,
}: UseCodemirrorOptions): UseCodemirrorResult {
  const viewRef = useRef<EditorView | null>(null);
  const cleanDocRef = useRef<Text>(Text.of([""]));

  const cursorCompartmentRef = useRef(new Compartment());
  const languageCompartmentRef = useRef(new Compartment());
  const wrapCompartmentRef = useRef(new Compartment());
  const lineNumbersCompartmentRef = useRef(new Compartment());

  const wrapEnabledRef = useRef(false);
  const lineNumbersEnabledRef = useRef(true);

  const [view, setView] = useState<EditorView | null>(null);
  const [dirty, setDirty] = useState(false);
  const [cursorLine, setCursorLine] = useState(1);
  const [cursorCol, setCursorCol] = useState(1);

  const updateListener = useMemo(() => {
    return EditorView.updateListener.of((update) => {
      const head = update.state.selection.main.head;
      const line = update.state.doc.lineAt(head);
      setCursorLine(line.number);
      setCursorCol(head - line.from + 1);

      if (update.docChanged) {
        setDirty(!update.state.doc.eq(cleanDocRef.current));
      }
    });
  }, []);

  useEffect(() => {
    if (initialDoc === null) {
      return;
    }
    if (viewRef.current) {
      return;
    }

    const parent = containerRef.current;
    if (!parent) {
      return;
    }

    const language = resolveLanguage(extension, contentType);
    const wrapEnabled = shouldWrapByDefault(extension, contentType);
    wrapEnabledRef.current = wrapEnabled;
    lineNumbersEnabledRef.current = true;

    const cursorCompartment = cursorCompartmentRef.current;
    const languageCompartment = languageCompartmentRef.current;
    const wrapCompartment = wrapCompartmentRef.current;
    const lineNumbersCompartment = lineNumbersCompartmentRef.current;

    const state = EditorState.create({
      doc: initialDoc,
      extensions: [
        editorModeField,
        keySuppression,
        wisdomEditorTheme,
        wisdomHighlightStyle,
        cursorCompartment.of(blockCursorTheme),
        languageCompartment.of(language ?? []),
        wrapCompartment.of(wrapEnabled ? EditorView.lineWrapping : []),
        lineNumbersCompartment.of(lineNumbers()),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        history(),
        bracketMatching(),
        closeBrackets(),
        foldGutter(),
        indentOnInput(),
        drawSelection(),
        highlightSelectionMatches(),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...foldKeymap,
          indentWithTab,
        ]),
        updateListener,
      ],
    });

    cleanDocRef.current = state.doc;
    setDirty(false);
    setCursorLine(1);
    setCursorCol(1);

    const nextView = new EditorView({
      state,
      parent,
    });

    viewRef.current = nextView;
    setView(nextView);

    return () => {
      nextView.destroy();
      viewRef.current = null;
      setView(null);
    };
  }, [containerRef, contentType, extension, initialDoc, updateListener]);

  useEffect(() => {
    const currentView = viewRef.current;
    if (!currentView) {
      return;
    }

    const languageCompartment = languageCompartmentRef.current;
    const wrapCompartment = wrapCompartmentRef.current;

    const language = resolveLanguage(extension, contentType);
    const wrapEnabled = shouldWrapByDefault(extension, contentType);
    wrapEnabledRef.current = wrapEnabled;

    currentView.dispatch({
      effects: [
        languageCompartment.reconfigure(language ?? []),
        wrapCompartment.reconfigure(wrapEnabled ? EditorView.lineWrapping : []),
      ],
    });
  }, [contentType, extension]);

  const getDoc = useCallback((): string => {
    const currentView = viewRef.current;
    return currentView ? currentView.state.doc.toString() : "";
  }, []);

  const markClean = useCallback(() => {
    const currentView = viewRef.current;
    if (!currentView) {
      return;
    }

    cleanDocRef.current = currentView.state.doc;
    setDirty(false);
  }, []);

  const reload = useCallback((content: string) => {
    const currentView = viewRef.current;
    if (!currentView) {
      return;
    }

    currentView.dispatch({
      changes: { from: 0, to: currentView.state.doc.length, insert: content },
      selection: { anchor: 0 },
    });

    cleanDocRef.current = currentView.state.doc;
    setDirty(false);
    setCursorLine(1);
    setCursorCol(1);
  }, []);

  const setMode = useCallback((mode: EditorMode) => {
    const currentView = viewRef.current;
    if (!currentView) {
      return;
    }

    const cursorCompartment = cursorCompartmentRef.current;
    const cursorExtension: Extension =
      mode === "insert" ? [] : blockCursorTheme;

    currentView.dispatch({
      effects: [
        setEditorMode.of(mode),
        cursorCompartment.reconfigure(cursorExtension),
      ],
    });
  }, []);

  const toggleWrap = useCallback(() => {
    const currentView = viewRef.current;
    if (!currentView) {
      return;
    }

    wrapEnabledRef.current = !wrapEnabledRef.current;
    currentView.dispatch({
      effects: wrapCompartmentRef.current.reconfigure(
        wrapEnabledRef.current ? EditorView.lineWrapping : [],
      ),
    });
  }, []);

  const toggleLineNumbers = useCallback(() => {
    const currentView = viewRef.current;
    if (!currentView) {
      return;
    }

    lineNumbersEnabledRef.current = !lineNumbersEnabledRef.current;
    currentView.dispatch({
      effects: lineNumbersCompartmentRef.current.reconfigure(
        lineNumbersEnabledRef.current ? lineNumbers() : [],
      ),
    });
  }, []);

  const goToLine = useCallback((line: number) => {
    const currentView = viewRef.current;
    if (!currentView) {
      return;
    }

    const maxLine = currentView.state.doc.lines;
    const clamped = Math.max(1, Math.min(Math.floor(line), maxLine));
    const info = currentView.state.doc.line(clamped);

    currentView.dispatch({
      selection: { anchor: info.from },
      effects: EditorView.scrollIntoView(info.from, { y: "center" }),
    });
    currentView.focus();
  }, []);

  return {
    view,
    getDoc,
    markClean,
    reload,
    dirty,
    cursorLine,
    cursorCol,
    setMode,
    toggleWrap,
    toggleLineNumbers,
    goToLine,
  };
}

export type { UseCodemirrorOptions, UseCodemirrorResult };
