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

  router.add("GET", "/resource/:token", getResource);

  return router;
}

async function getResource(req: Request, ctx: Ctx) {
  return catchErrors(async () => {
    const { bucket } = ctx.bindings;
    const { token } = ctx.params;

    const payload = await verifyToken(ctx, token);
    if (!payload) return unauthorized();

    const { file } = z.object({ file: z.string() }).parse(payload);

    let range = tryParseRange(req.headers);
    const onlyIf = tryParseR2Conditional(req.headers);

    let obj = await bucket.get(file, { onlyIf, range });

    if (obj) {
      if (range && computeHeaders(obj, range).has("content-encoding")) {
        range = undefined;
        obj = await bucket.get(file);

        if (!obj) throw new Error("Object missing without range");
      }

      return computeObjResponse(obj, range ? 206 : 200, range, onlyIf);
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
