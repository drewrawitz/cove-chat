import { expect, it } from "vite-plus/test";
import { getContext } from "./root-provider.tsx";

it("reuses query data while it is fresh", async () => {
  const { queryClient } = getContext();
  let requestCount = 0;
  const query = {
    queryKey: ["/api/app/v1/me"],
    queryFn: () => {
      requestCount += 1;
      return Promise.resolve({ id: "account-1" });
    },
  };

  await queryClient.fetchQuery(query);
  await queryClient.fetchQuery(query);

  expect(requestCount).toBe(1);
});
