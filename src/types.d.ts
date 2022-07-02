/// <reference types="@cloudflare/workers-types" />
/// <reference types="@types/service-worker-mock" />

type Bindings = {
  API_PUBLIC_KEY: string;
  bucket: R2Bucket;
};

type Ctx = { bindings: Bindings } & import("worktop").Context;
