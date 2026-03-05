import { LanguageSupport, StreamLanguage } from "@codemirror/language";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { sql } from "@codemirror/lang-sql";
import { xml } from "@codemirror/lang-xml";
import { yaml } from "@codemirror/lang-yaml";
import { rust } from "@codemirror/lang-rust";
import { cpp } from "@codemirror/lang-cpp";
import { go } from "@codemirror/lang-go";
import { toml } from "@codemirror/legacy-modes/mode/toml";
import { shell } from "@codemirror/legacy-modes/mode/shell";

const legacyToml = new LanguageSupport(StreamLanguage.define(toml));
const legacyShell = new LanguageSupport(StreamLanguage.define(shell));

export function normalizedExtension(extension: string | null): string | null {
  if (!extension) {
    return null;
  }
  const trimmed = extension.startsWith(".") ? extension.slice(1) : extension;
  const normalized = trimmed.toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function resolveByExtension(extension: string | null): LanguageSupport | null {
  switch (normalizedExtension(extension)) {
    case "js":
    case "jsx":
    case "mjs":
      return javascript({ jsx: true });
    case "ts":
    case "tsx":
    case "mts":
      return javascript({ jsx: true, typescript: true });
    case "go":
      return go();
    case "py":
    case "pyw":
      return python();
    case "rs":
      return rust();
    case "c":
    case "h":
    case "cpp":
    case "cc":
    case "cxx":
    case "hpp":
    case "hxx":
      return cpp();
    case "html":
    case "htm":
      return html();
    case "css":
      return css();
    case "json":
      return json();
    case "toml":
      return legacyToml;
    case "yaml":
    case "yml":
      return yaml();
    case "md":
    case "markdown":
      return markdown();
    case "sql":
      return sql();
    case "xml":
    case "svg":
      return xml();
    case "sh":
    case "bash":
    case "zsh":
    case "fish":
      return legacyShell;
    default:
      return null;
  }
}

function resolveByContentType(
  contentType: string | null,
): LanguageSupport | null {
  switch (contentType) {
    case "application/json":
      return json();
    case "application/javascript":
      return javascript();
    case "application/typescript":
      return javascript({ typescript: true });
    case "application/xml":
    case "text/xml":
      return xml();
    case "application/toml":
      return legacyToml;
    case "application/yaml":
      return yaml();
    case "application/x-sh":
      return legacyShell;
    case "application/sql":
      return sql();
    case "text/html":
      return html();
    case "text/css":
      return css();
    case "text/markdown":
      return markdown();
    default:
      return null;
  }
}

export function resolveLanguage(
  extension: string | null,
  contentType: string | null,
): LanguageSupport | null {
  return resolveByExtension(extension) ?? resolveByContentType(contentType);
}

function displayNameByExtension(extension: string | null): string | null {
  switch (normalizedExtension(extension)) {
    case "js":
    case "jsx":
    case "mjs":
      return "JavaScript";
    case "ts":
    case "tsx":
    case "mts":
      return "TypeScript";
    case "go":
      return "Go";
    case "py":
    case "pyw":
      return "Python";
    case "rs":
      return "Rust";
    case "c":
    case "h":
      return "C";
    case "cpp":
    case "cc":
    case "cxx":
    case "hpp":
    case "hxx":
      return "C++";
    case "html":
    case "htm":
      return "HTML";
    case "css":
      return "CSS";
    case "json":
      return "JSON";
    case "toml":
      return "TOML";
    case "yaml":
    case "yml":
      return "YAML";
    case "md":
    case "markdown":
      return "Markdown";
    case "sql":
      return "SQL";
    case "xml":
    case "svg":
      return "XML";
    case "sh":
    case "bash":
    case "zsh":
    case "fish":
      return "Shell";
    default:
      return null;
  }
}

function displayNameByContentType(contentType: string | null): string | null {
  switch (contentType) {
    case "application/json":
      return "JSON";
    case "application/javascript":
      return "JavaScript";
    case "application/typescript":
      return "TypeScript";
    case "application/xml":
    case "text/xml":
      return "XML";
    case "application/toml":
      return "TOML";
    case "application/yaml":
      return "YAML";
    case "application/x-sh":
      return "Shell";
    case "application/sql":
      return "SQL";
    case "text/html":
      return "HTML";
    case "text/css":
      return "CSS";
    case "text/markdown":
      return "Markdown";
    default:
      return null;
  }
}

export function languageDisplayName(
  extension: string | null,
  contentType: string | null,
): string {
  return (
    displayNameByExtension(extension) ??
    displayNameByContentType(contentType) ??
    "Plain Text"
  );
}
