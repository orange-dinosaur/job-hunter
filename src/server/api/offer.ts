import type { Database } from "bun:sqlite";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { DATA_DIR } from "../../db/migrate.ts";
import { getOffer, offerStatuses, setStatus } from "../../db/offers.ts";
import { loadProfile } from "../../profile/load.ts";

const statusInput = z.strictObject({
  status: z.enum(offerStatuses),
  note: z.string().nullable(),
});

const notFound = () =>
  Response.json({ error: "no such offer" }, { status: 404 });

function detail(db: Database, id: string) {
  const offer = getOffer(db, id);
  if (!offer) return null;
  const file = join(DATA_DIR, "offers", id, "offer.md");
  return {
    ...offer,
    text: existsSync(file) ? readFileSync(file, "utf8") : null,
    weights: loadProfile(join(DATA_DIR, "search-profile.yaml")).weights,
  };
}

export type OfferDetail = NonNullable<ReturnType<typeof detail>>;

export function offerRoutes(db: Database) {
  return {
    "/api/offers/:id": {
      GET(req: Bun.BunRequest<"/api/offers/:id">) {
        const offer = detail(db, req.params.id);
        return offer ? Response.json(offer) : notFound();
      },
    },
    "/api/offers/:id/status": {
      async POST(req: Bun.BunRequest<"/api/offers/:id/status">) {
        if (!getOffer(db, req.params.id)) return notFound();
        const input = statusInput.safeParse(await req.json().catch(() => null));
        if (!input.success)
          return Response.json(
            { error: z.prettifyError(input.error) },
            { status: 400 },
          );
        setStatus(
          db,
          req.params.id,
          input.data.status,
          input.data.note || null,
        );
        return Response.json(detail(db, req.params.id));
      },
    },
  };
}
