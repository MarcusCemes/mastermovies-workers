import { importSPKI, JWTPayload, jwtVerify } from "jose";
import { Router } from "worktop";
import { z } from "zod";
import { notFound, unauthorized } from "./responses";
import {
  catchErrors,
  computeHeaders,
  computeObjResponse,
  tryParseR2Conditional,
  tryParseRange,
} from "./utils";

const TOKEN_AUDIENCE = "storage.mmcf";

export function createRouter() {
  const router = new Router<Ctx>();

  router.add("GET", "/", index);
  router.add("GET", "/access/:token", accessResource);

  return router;
}

async function index(req: Request, _ctx: Ctx): Promise<Response> {
  const { city, colo, country, continent, region, regionCode, tlsVersion } =
    req.cf;

  const body = `MasterMovies Cloudflare Bridge

Request details:
  City:        ${city}
  Datacenter:  ${colo}
  Region:      ${region} (${regionCode})
  Country:     ${country} (${continent})
  Connection:  ${tlsVersion}`;

  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

async function accessResource(req: Request, ctx: Ctx): Promise<Response> {
  return catchErrors(async () => {
    const { bucket } = ctx.bindings;
    const { token } = ctx.params;

    const payload = await verifyToken(ctx, token);
    if (!payload) return unauthorized();

    const { file, name } = z
      .object({ file: z.string(), name: z.string().optional() })
      .parse(payload);

    let range = tryParseRange(req.headers);
    const onlyIf = tryParseR2Conditional(req.headers);

    let obj = await bucket.get(file, { onlyIf, range });

    if (obj) {
      if (range && computeHeaders(obj, range).has("content-encoding")) {
        range = undefined;
        obj = await bucket.get(file);

        if (!obj) throw new Error("Object missing without range");
      }

      const download = ctx.url.searchParams.has("download")
        ? name || true
        : false;

      return computeObjResponse(
        obj,
        range ? 206 : 200,
        range,
        onlyIf,
        download
      );
    }

    return notFound("GET");
  });
}

async function verifyToken(
  ctx: Ctx,
  token: string
): Promise<JWTPayload | undefined> {
  const key = getKey(ctx);

  return jwtVerify(token, await importSPKI(key, "EdDSA"), {
    audience: TOKEN_AUDIENCE,
  })
    .then(({ payload }) => payload)
    .catch(() => undefined);
}

function getKey(ctx: Ctx): string {
  const key = ctx.bindings.API_PUBLIC_KEY;
  if (!key) throw new Error("API_PUBLIC_KEY not set!");
  return key;
}
