import { handleQueryRequest } from "@rocicorp/zero/server";
import { mustGetQuery } from "@rocicorp/zero";
import { queries, schema, type QueryContext } from "./index.ts";

export interface CoveQueryRequest {
  readonly request: Request;
  readonly userID: string;
}

export const handleCoveQueryRequest = async ({ request, userID }: CoveQueryRequest) =>
  handleQueryRequest({
    handler: (name, args) => {
      const query = mustGetQuery(queries, name);
      return query.fn({
        args,
        ctx: { userID } satisfies QueryContext,
      });
    },
    request,
    schema,
    userID,
  });

export { queries, schema, type QueryContext };
