import { type QueryKey, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "./snackbar.tsx";

interface UseJoinChannelOptions {
  readonly additionalRefresh?: () => Promise<unknown>;
  readonly queriesToInvalidate: ReadonlyArray<QueryKey>;
  readonly successMessage: (channelName: string) => string;
}

interface JoinChannel {
  readonly onJoined: (channelName: string) => Promise<void>;
  readonly refresh: () => Promise<void>;
}

export function useJoinChannel({
  additionalRefresh,
  queriesToInvalidate,
  successMessage,
}: UseJoinChannelOptions): JoinChannel {
  const queryClient = useQueryClient();
  const { showSnackbar } = useSnackbar();

  const refresh = async (): Promise<void> => {
    const refreshes: Array<Promise<unknown>> = queriesToInvalidate.map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }),
    );
    if (additionalRefresh !== undefined) refreshes.push(additionalRefresh());
    await Promise.all(refreshes);
  };

  const onJoined = async (channelName: string): Promise<void> => {
    await refresh();
    showSnackbar(successMessage(channelName));
  };

  return { onJoined, refresh };
}
