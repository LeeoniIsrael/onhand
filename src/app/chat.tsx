import React from "react";
import { Redirect, useLocalSearchParams } from "expo-router";
export default function Screen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return (
    <Redirect
      href={
        typeof id === "string" ? { pathname: "/job", params: { id } } : "/jobs"
      }
    />
  );
}
