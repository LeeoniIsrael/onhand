import React from "react";
import { router } from "expo-router";
import { Page, Copy, Action, Stack } from "../marketplace/ui";
export default function NotFound() {
  return (
    <Page title="This page has moved">
      <Stack>
        <Copy>Open your jobs or start from Home.</Copy>
        <Action title="Go home" onPress={() => router.replace("/")} />
      </Stack>
    </Page>
  );
}
