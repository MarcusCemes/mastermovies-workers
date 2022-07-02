import { preconditionFailed, unmodified } from "./responses";

export async function catchErrors<T>(fn: () => T): Promise<T | Response> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof Response) return error;
    else throw error;
  }
}

/* == Headers == */

export function computeHeaders(obj: R2Object, range?: R2Range): Headers {
  const headers = new Headers();

  obj.writeHttpMetadata(headers);

  headers.set("content-length", String(obj.size));
  headers.set("etag", obj.httpEtag);
  headers.set("last-modified", obj.uploaded.toUTCString());

  if (range) headers.set("content-range", computeContentRange(range, obj.size));
  return headers;
}

export function tryParseR2Conditional(
  headers: Headers
): R2Conditional | undefined {
  const ifNoneMatch = headers.get("if-none-match") || undefined;
  const etagDoesNotMatch = ifNoneMatch
    ? stripEtagQuoting(ifNoneMatch)
    : undefined;

  const ifMatch = headers.get("if-match") || undefined;
  const etagMatches = ifMatch ? stripEtagQuoting(ifMatch) : undefined;

  const ifModifiedSince = headers.get("if-modified-since") || undefined;
  const uploadedAfter = ifModifiedSince
    ? addingOneSecond(new Date(ifModifiedSince))
    : undefined;

  const ifUnmodifiedSince = headers.get("if-unmodified-since") || undefined;
  const uploadedBefore = ifUnmodifiedSince
    ? new Date(ifUnmodifiedSince)
    : undefined;

  return etagDoesNotMatch || etagMatches || uploadedAfter || uploadedBefore
    ? { etagDoesNotMatch, etagMatches, uploadedAfter, uploadedBefore }
    : undefined;
}

function stripEtagQuoting(str: string): string {
  const m = /^(W\/)?"(.*)"$/.exec(str);
  return m ? m[2] : str;
}

function addingOneSecond(time: Date): Date {
  return new Date(time.getTime() + 1000);
}

export function tryParseRange(headers: Headers): R2Range | undefined {
  const m = /^bytes=(\d*)-(\d*)$/.exec(headers.get("range") || "");
  if (!m) return undefined;
  const lhs = m[1] === "" ? undefined : parseInt(m[1]);
  const rhs = m[2] === "" ? undefined : parseInt(m[2]);
  if (lhs === undefined && typeof rhs === "number") return { suffix: rhs };
  if (typeof lhs === "number" && rhs === undefined) return { offset: lhs };
  if (typeof lhs === "number" && typeof rhs === "number") {
    const length = rhs - lhs + 1;
    return length > 0 ? { offset: lhs, length } : undefined;
  }
}

export function computeContentRange(range: R2Range, size: number) {
  const offset = "offset" in range ? range.offset : undefined;
  const length = "length" in range ? range.length : undefined;
  const suffix = "suffix" in range ? range.suffix : undefined;

  const startOffset =
    typeof suffix === "number"
      ? size - suffix
      : typeof offset === "number"
      ? offset
      : 0;
  const endOffset =
    typeof suffix === "number"
      ? size
      : typeof length === "number"
      ? startOffset + length
      : size;

  return `bytes ${startOffset}-${endOffset - 1}/${size}`;
}

export function computeObjResponse(
  obj: R2Object,
  status: number,
  range?: R2Range,
  onlyIf?: R2Conditional,
  download = false
): Response {
  let body: ReadableStream | undefined;

  if (isR2ObjectBody(obj)) {
    body = obj.body;
  } else if (onlyIf) {
    if (onlyIf.etagDoesNotMatch) return unmodified();
    if (onlyIf.uploadedAfter) return unmodified();
    if (onlyIf.etagMatches) return preconditionFailed();
    if (onlyIf.uploadedBefore) return preconditionFailed();
  }

  const headers = computeHeaders(obj, range);

  if (download) {
    headers.set(
      "content-disposition",
      `attachment; filename="${obj.key.split("/").at(-1)}"`
    );
  }

  const encodeBody = headers.has("content-encoding") ? "manual" : undefined;

  return new Response(body, { status, headers, encodeBody });
}

/* == Type guards == */

export function isR2ObjectBody(obj: R2Object): obj is R2ObjectBody {
  return "body" in obj;
}
