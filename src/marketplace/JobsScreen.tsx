import React, { useState } from "react";
import { FlatList, View } from "react-native";
import { router } from "expo-router";
import { useHome } from "./Provider";
import { marketplace, friendlyError } from "./api";
import type { MarketplaceJob } from "./types";
import {
  Action,
  Copy,
  JobRow,
  Notice,
  Page,
  palette,
  QuietAction,
  Stack,
} from "./ui";
export default function JobsScreen() {
  const home = useHome();
  const [older, setOlder] = useState<MarketplaceJob[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const jobs = [...(home.data?.jobs ?? []), ...older].filter(
    (j, i, all) => all.findIndex((x) => x.id === j.id) === i,
  );
  async function more() {
    const last = jobs.at(-1);
    if (!last) return;
    setBusy(true);
    setError(null);
    try {
      const page = await marketplace.home(last);
      setOlder((current) => [...current, ...page.jobs]);
      setDone(page.jobs.length < 20);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Page
      title="Your jobs"
      subtitle={
        home.data?.profile.role === "worker"
          ? "Current work and completed jobs, in one place."
          : "Every request, from first post to final approval."
      }
      scroll={false}
    >
      <FlatList
        style={{ flex: 1 }}
        data={jobs}
        keyExtractor={(j) => j.id}
        renderItem={({ item }) => (
          <JobRow
            job={item}
            onPress={() =>
              router.push({ pathname: "/job", params: { id: item.id } })
            }
          />
        )}
        refreshing={home.isRefetching}
        onRefresh={() => {
          setOlder([]);
          setDone(false);
          void home.refetch();
        }}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
        ListEmptyComponent={
          <Stack style={{ paddingVertical: 36 }}>
            <Copy size={23} weight="600">
              {home.data?.profile.role === "worker"
                ? "Your work starts here."
                : "Your list is clear."}
            </Copy>
            <Copy color={palette.slate}>
              {home.data?.profile.role === "worker"
                ? "Accepted jobs and their progress will appear here."
                : "Post a job and we’ll help find someone to handle it."}
            </Copy>
            <Action
              title={
                home.data?.profile.role === "worker"
                  ? "Find work"
                  : "Post a job"
              }
              onPress={() =>
                router.push(
                  home.data?.profile.role === "worker" ? "/" : "/request",
                )
              }
            />
          </Stack>
        }
        ListFooterComponent={
          <View style={{ paddingVertical: 16 }}>
            {error && <Notice error>{error}</Notice>}
            {!done && jobs.length >= 20 && (
              <QuietAction
                title={busy ? "Loading…" : "Load older jobs"}
                disabled={busy}
                onPress={() => void more()}
              />
            )}
          </View>
        }
      />
    </Page>
  );
}
