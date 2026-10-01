import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The full set of schema files needed to validate a document against a given
 * root XSD: the root itself plus every schema reachable through
 * `xs:import` / `xs:include` / `xs:redefine`.
 */
export type SchemaClosure = {
  /** The flattened file name of the root schema (use as the main schema). */
  rootFileName: string;
  /** Every schema file in the closure, keyed by its flattened file name. */
  files: { fileName: string; contents: string }[];
};

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Where downloaded + rewritten schema files are cached between runs. */
const CACHE_DIR = join(__dirname, "..", "node_modules", ".schema_cache");

/** In-memory cache so repeated validations in one run skip disk + network. */
const memoryCache = new Map<string, Promise<SchemaClosure>>();

/**
 * QTI schemas reference their dependencies (MathML, XInclude, APIP, ...) by
 * `schemaLocation`, sometimes as absolute URLs and sometimes relative to the
 * referencing file. xmllint resolves those references against an in-memory
 * file system and does not perform any network IO of its own.
 *
 * This resolver walks the import/include graph starting from a root URL,
 * downloads every reachable schema once (caching to disk), and rewrites every
 * `schemaLocation` to a flat, collision-free local file name. The result can
 * be handed straight to xmllint as `schema` + `preload`, with no further
 * network access required.
 */
export async function resolveSchemaClosure(
  rootUrl: string,
): Promise<SchemaClosure> {
  let pending = memoryCache.get(rootUrl);
  if (!pending) {
    pending = loadOrCrawl(rootUrl);
    memoryCache.set(rootUrl, pending);
  }
  return pending;
}

async function loadOrCrawl(rootUrl: string): Promise<SchemaClosure> {
  const indexPath = join(CACHE_DIR, `${shortHash(rootUrl)}.index.json`);

  if (existsSync(indexPath)) {
    const cached = await loadFromCache(indexPath);
    if (cached) return cached;
  }

  const closure = await crawl(rootUrl);
  await persistToCache(indexPath, closure);
  return closure;
}

/**
 * Maps a schema URL to a deterministic, file-system-safe name. The short hash
 * keeps files with identical base names (e.g. several `xml.xsd`) distinct,
 * while the suffix keeps cache directories browsable.
 */
function fileNameForUrl(url: string): string {
  const base = url.split(/[/?#]/).filter(Boolean).pop() ?? "schema.xsd";
  const safeBase = base.replace(/[^a-zA-Z0-9._-]/g, "_");
  // Avoid file names that xmllint-wasm could mistake for CLI flags.
  return `${shortHash(url)}_${safeBase.replace(/^-+/, "")}`;
}

function shortHash(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 12);
}

async function crawl(rootUrl: string): Promise<SchemaClosure> {
  const urlToFileName = new Map<string, string>();
  const files: { fileName: string; contents: string }[] = [];
  const queue = [rootUrl];
  const seen = new Set<string>();

  const nameFor = (url: string): string => {
    let name = urlToFileName.get(url);
    if (!name) {
      name = fileNameForUrl(url);
      urlToFileName.set(url, name);
    }
    return name;
  };

  while (queue.length > 0) {
    const url = queue.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);

    const raw = await fetchText(url);

    // Rewrite every schemaLocation to its flattened local name and collect the
    // referenced URLs to continue the crawl. In an XSD this attribute only
    // appears on import/include/redefine, so a blanket rewrite is safe.
    const rewritten = raw.replace(
      /schemaLocation\s*=\s*"([^"]+)"/g,
      (_match, location: string) => {
        const absoluteUrl = new URL(location, url).href;
        if (!seen.has(absoluteUrl)) queue.push(absoluteUrl);
        return `schemaLocation="${nameFor(absoluteUrl)}"`;
      },
    );

    files.push({ fileName: nameFor(url), contents: rewritten });
  }

  return { rootFileName: nameFor(rootUrl), files };
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(
      `Failed to download schema ${url}: HTTP ${response.status}`,
    );
  }
  return decodeSchema(new Uint8Array(await response.arrayBuffer()));
}

/**
 * Some 1EdTech schemas (notably XInclude.xsd) are served as UTF-16. We decode
 * by BOM and normalise the XML declaration to UTF-8, because we hand the
 * contents to xmllint as a UTF-8 string.
 */
function decodeSchema(bytes: Uint8Array): string {
  let encoding = "utf-8";
  if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = "utf-16le";
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = "utf-16be";

  // TextDecoder strips a leading BOM for us.
  const text = new TextDecoder(encoding).decode(bytes);
  return text.replace(/(<\?xml[^>]*encoding\s*=\s*")[^"]*(")/i, `$1UTF-8$2`);
}

type CacheIndex = { rootFileName: string; fileNames: string[] };

async function loadFromCache(indexPath: string): Promise<SchemaClosure | null> {
  try {
    const index: CacheIndex = JSON.parse(await readFile(indexPath, "utf-8"));
    const files = await Promise.all(
      index.fileNames.map(async (fileName) => ({
        fileName,
        contents: await readFile(join(CACHE_DIR, fileName), "utf-8"),
      })),
    );
    return { rootFileName: index.rootFileName, files };
  } catch {
    // Corrupt or partial cache: fall back to a fresh crawl.
    return null;
  }
}

async function persistToCache(
  indexPath: string,
  closure: SchemaClosure,
): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  await Promise.all(
    closure.files.map((file) =>
      writeFile(join(CACHE_DIR, file.fileName), file.contents),
    ),
  );
  const index: CacheIndex = {
    rootFileName: closure.rootFileName,
    fileNames: closure.files.map((file) => file.fileName),
  };
  await writeFile(indexPath, JSON.stringify(index, null, 2));
}
