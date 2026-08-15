/// <reference types="@cloudflare/workers-types/experimental" />

declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
  }
}
