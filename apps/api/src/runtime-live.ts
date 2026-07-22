import {
  AuthenticationEmailNotifier,
  ConsoleEmailSender,
  WorkspaceInvitationEmailNotifier,
} from "@cove/infrastructure-email";
import { ChannelAccessLive, TopicAccessLive } from "@cove/application";
import { PostgresClientLive, PostgresRepositories } from "@cove/infrastructure-postgres";
import { Effect, Layer } from "effect";
import { ApiConfiguration, ApiConfigurationLive } from "./api-configuration.ts";
import { PostgresDatabaseReadiness } from "./health/index.ts";
import { HttpLive, NodeServerLive } from "./http-live.ts";

const PostgresHealthLive = PostgresDatabaseReadiness.pipe(Layer.provide(PostgresClientLive));

const EmailLive = Layer.unwrap(
  Effect.map(ApiConfiguration, ({ publicWebOrigin }) =>
    Layer.mergeAll(
      AuthenticationEmailNotifier.layer({ publicWebOrigin }),
      WorkspaceInvitationEmailNotifier.layer({ publicWebOrigin }),
    ).pipe(Layer.provide(ConsoleEmailSender)),
  ),
);

const PostgresAuthLive = PostgresRepositories.pipe(
  Layer.provide(PostgresClientLive),
  Layer.provide(EmailLive),
);

const ChannelApplicationLive = ChannelAccessLive.pipe(Layer.provide(PostgresAuthLive));
const TopicApplicationLive = TopicAccessLive.pipe(
  Layer.provide(ChannelApplicationLive),
  Layer.provide(PostgresAuthLive),
);

const InfrastructureLive = Layer.mergeAll(
  NodeServerLive,
  PostgresHealthLive,
  PostgresAuthLive,
  ChannelApplicationLive,
  TopicApplicationLive,
  EmailLive,
).pipe(Layer.provideMerge(ApiConfigurationLive));

export const ApiLive = HttpLive.pipe(Layer.provide(InfrastructureLive));
