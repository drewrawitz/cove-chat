import { Schema } from "effect";
import {
  TOPIC_SUMMARY_PREVIEW_MAX_BYTES,
  isWithinUtf8ByteLimit,
  truncateUtf8,
} from "../content-bounds.ts";

export const TopicSummaryPreview = Schema.String.check(
  Schema.makeFilter(isWithinUtf8ByteLimit(TOPIC_SUMMARY_PREVIEW_MAX_BYTES)),
).pipe(Schema.brand("TopicSummaryPreview"));
export type TopicSummaryPreview = typeof TopicSummaryPreview.Type;

export const makeTopicSummaryPreview = (value: string): TopicSummaryPreview =>
  TopicSummaryPreview.make(truncateUtf8(value, TOPIC_SUMMARY_PREVIEW_MAX_BYTES));
