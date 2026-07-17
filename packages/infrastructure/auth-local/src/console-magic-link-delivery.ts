import { MagicLinkDelivery } from "@cove/ports";
import { Config, Effect, Layer, Redacted } from "effect";

const make = Effect.gen(function* () {
  const verifyUrl = yield* Config.string("MAGIC_LINK_VERIFY_URL").pipe(
    Config.withDefault("http://localhost:3000/auth/verify"),
  );

  return MagicLinkDelivery.of({
    send: Effect.fn("ConsoleMagicLinkDelivery.send")(({ recipient, token }) =>
      Effect.logWarning("Development magic link", {
        recipient,
        url: `${verifyUrl}?token=${encodeURIComponent(Redacted.value(token))}`,
      }),
    ),
  });
});

export const ConsoleMagicLinkDelivery = Layer.effect(MagicLinkDelivery, make);
