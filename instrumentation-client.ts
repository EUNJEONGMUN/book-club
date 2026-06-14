// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

// Next.js의 server action 요청(fetch POST)이 사용자측 네트워크 일순 끊김 등으로
// 실패하면 fetchServerAction 안에서 "TypeError: Load failed" / "Failed to fetch"가
// unhandled promise rejection으로 올라옴. 우리 코드 버그가 아니라 사용자 환경 문제라
// Sentry에 쌓이면 진짜 버그가 묻힘 → 여기서 drop.
const NETWORK_FETCH_PATTERN = /Load failed|Failed to fetch|NetworkError/i;
const SERVER_ACTION_STACK_PATTERN = /fetchServerAction|server-action-reducer/;

function isServerActionNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (!NETWORK_FETCH_PATTERN.test(err.message)) return false;
  return SERVER_ACTION_STACK_PATTERN.test(err.stack ?? '');
}

Sentry.init({
  dsn: "https://fce608438305676ee890456c8c911d6d@o4511517199368192.ingest.us.sentry.io/4511517223026688",

  // Add optional integrations for additional features
  integrations: [Sentry.replayIntegration()],

  // 10% in production to stay within free quota, 100% locally for debugging.
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1,
  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Define how likely Replay events are sampled.
  // This sets the sample rate to be 10%. You may want this to be 100% while
  // in development and sample at a lower rate in production
  replaysSessionSampleRate: 0.1,

  // Define how likely Replay events are sampled when an error occurs.
  replaysOnErrorSampleRate: 1.0,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: true,

  beforeSend(event, hint) {
    if (isServerActionNetworkError(hint?.originalException)) return null;
    return event;
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
