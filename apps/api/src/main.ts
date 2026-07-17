import { NodeRuntime } from "@effect/platform-node";
import { Layer } from "effect";
import { ApiLive } from "./runtime-live.ts";

Layer.launch(ApiLive).pipe(NodeRuntime.runMain);
