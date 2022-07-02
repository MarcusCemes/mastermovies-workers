export function notFound(method: string): Response {
  return new Response(method === "HEAD" ? undefined : "Not found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export function unmodified(): Response {
  return new Response(undefined, { status: 304 });
}

export function preconditionFailed(): Response {
  return new Response("Precondition failed", { status: 412 });
}

export function unauthorized(): Response {
  return new Response("Unauthorized", { status: 401 });
}
